import * as _ from 'lodash';
import * as url from 'url';
import * as fs from 'fs';
import * as qs from 'query-string';
import * as yaml from 'js-yaml';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { HttpLink } from 'apollo-link-http';


function _checkVariableMutation(mutation: string): Boolean {
  const mutationName = mutation.slice(mutation.indexOf(' '),
    mutation.indexOf('($'));
  if (mutationName.indexOf('$') > 0) {
    return false;
  } else {
    return new RegExp('\\b' + mutationName + '\\(', 'i').test(mutation);
  }
}

function _replaceInlineVars(mutation: string, args: any): string {
  if (mutation)
    return mutation.replace(/\${(\w+)}/g, (_, v) => args[v]);
}

function _createQueryVariables(inputVarName: string,
  queryVarKey: string, varValue: any): Object {
  return {
    [inputVarName]: {
      [queryVarKey]: JSON.parse(varValue)
    }
  };
}

export class Client {
  opts: any;
  metaQs: any;
  entryBaseUrl: string;
  constructor(opts: any) {
    if (_.isNil(opts)) {
      throw new Error('Missing options parameter');
    }

    this.metaQs = { meta: true };

    _.defaults(opts, {
      entry: null,
      protocol: 'http',
      apiKey: null,
      headers: {}
    });

    const required = ['entry'];
    required.forEach((key) => {
      if (!opts[key]) {
        throw new Error('Missing option: \'' + key + '\'');
      }
    });

    this.opts = opts;
    this._buildURLs();

    _.assign(this.opts.headers, {
      Accept: 'application/json',
      Origin: this.entryBaseUrl
    });
  }

  _buildURLs(): any {
    const entry = this.opts.entry;
    if (!String(entry).startsWith('http')) {
      this.opts.entry = this.opts.protocol + '://' + entry;
    }
    const parsedEntry = url.parse(entry);
    if (parsedEntry.protocol) {
      this.opts.protocol = parsedEntry.protocol;
    }
    const protocol = this.opts.protocol + '//';
    this.entryBaseUrl = protocol + parsedEntry.host + parsedEntry.path;
  }

  _normalizeUrl(source?: any): string {
    let extendURL = '';

    if (source) {
      // this is source.path /restore/oss-client/test/folder/file.1
      if (!source.path && source != true) {
        extendURL = source;
      }
      if (source.path) {
        // TODO: read this 'the Node way'
        extendURL = fs.readFileSync(source.path).toString();
        extendURL = '?query=' + extendURL;
      }
    }
    return url.resolve(this.entryBaseUrl, extendURL);
  }

  async post(source: any, metaData?: any, accessControl?: any,
    formOptions?: any): Promise<any> {
    let mutation;
    let variables;
    let caseExpression;
    source = JSON.parse(source);
    const normalUrl = this._normalizeUrl();

    if (source.resource_list) {
      caseExpression = 'json';
    } else if (source.yaml_file_paths) {
      caseExpression = 'yaml';
    }

    if (source.mutation) {
      mutation = JSON.stringify(source.mutation);
    }

    const apiKey = JSON.stringify(this.opts.apiKey);
    let resource_list: any = [];
    switch (caseExpression) {
      case 'json':
        resource_list = JSON.stringify(source.resource_list);
        // To remove double quotes from the keys in JSON data
        resource_list = resource_list.replace(/\"([^(\")"]+)\":/g, '$1:');
        break;

      case 'yaml':
        _.forEach(source.yaml_file_paths, (ymlFilePath) => {
          const doc = yaml.safeLoad(fs.readFileSync(ymlFilePath,
            'utf8'));
          const rootKey = Object.keys(doc)[0];
          resource_list = doc[rootKey];
          resource_list = JSON.stringify(resource_list);
        });
        break;

      default:
        console.log('File format not recognizable');
    }

    if (mutation) {
      mutation = mutation.replace(/\"/g, '');
    }

    if (_checkVariableMutation(mutation)) {
      const queryVarKey = source.queryVariables;
      const inputVarName = mutation.slice(mutation.indexOf('$') + 1, mutation.indexOf(':'));
      variables = _createQueryVariables(inputVarName, queryVarKey, resource_list);
    } else {
      // update the muation with inline variables
      mutation = _replaceInlineVars(mutation, { resource_list, apiKey });
    }

    const apolloCache = new InMemoryCache();
    const apolloLink = new HttpLink({
      uri: normalUrl,
      headers: this.opts.headers
    });
    // now what exactly is "...others"?
    // const gqlClient = new GraphQLClient(normalUrl, _.pick(this.opts, ['headers', '...others']));

    const apolloClient = new ApolloClient({
      cache: apolloCache,
      link: apolloLink
    });
    
    return apolloClient.mutate({
      mutation: mutation,
      variables: variables
    });
  }
}
