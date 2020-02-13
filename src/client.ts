import * as _ from 'lodash';
import * as url from 'url';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import gql from 'graphql-tag';
import { ApolloClient } from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import fetch from 'node-fetch'; // required for apollo-link-http
import { createHttpLink } from 'apollo-link-http';
import { createUploadLink } from 'apollo-upload-client';


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
    } else if (source.file_blob_paths) {
      caseExpression = 'blob'
    }

    if (source.mutation) {
      mutation = JSON.stringify(source.mutation);
    }

    const apiKey = JSON.stringify(this.opts.apiKey);
    let resource_list: any = [];
    let fileUploads;
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

      case 'blob':
        fileUploads = [];
        _.forEach(source.file_blob_paths, (fileBlobPath) => {
          fileUploads.push(new Blob([fs.readFileSync(fileBlobPath).buffer]));
        });
        break;

      default:
        console.log('File format not recognizable');
    }
    
    if (mutation) {
      // don't replace quoted strings inside outer quotes
      // (i.e. if the quote is preceded by a backslash)
      // make sure to also match line/expression start
      // and keep the symbol preceding the quote
      mutation = mutation.replace(/(^|[^\\])\"/g, '$1');
    }

    if (!fileUploads) {
      if (_checkVariableMutation(mutation)) {
        const queryVarKey = source.queryVariables;
        const inputVarName = mutation.slice(mutation.indexOf('$') + 1, mutation.indexOf(':'));
        variables = _createQueryVariables(inputVarName, queryVarKey, resource_list);
      } else {
        mutation = _replaceInlineVars(mutation, { resource_list, apiKey });
      }
    }

    const apolloLinkOpts = {
      uri: normalUrl,
      fetch
    };    

    if (this.opts.headers) {
      apolloLinkOpts['headers'] = this.opts.headers;
    }

    let apolloLink;
    if (fileUploads) {
      apolloLink = createUploadLink(apolloLinkOpts);
    } else {
      apolloLink = createHttpLink(apolloLinkOpts);
    }
    

    // now what exactly is/was "...others"?
    // const gqlClient = new GraphQLClient(normalUrl, _.pick(this.opts, ['headers', '...others']));

    const apolloCache = new InMemoryCache();
    const apolloClient = new ApolloClient({
      cache: apolloCache,
      link: apolloLink
    });

    if (fileUploads) {
      // The GQL file upload libraries only support FileList (read-only type)
      // and/or single files/blobs. Hence, uploads need to be run one by one.
      let uploadMutations = [];
      for (let blob of fileUploads) {
        variables = { 'file': blob };
        uploadMutations.push(
          apolloClient.mutate({
            // Mutation string must be pre-parsed into GQL AST via 'gql' template literal
            mutation: gql`${mutation}`, 
            variables
          })
        );
      }
      return Promise.all(uploadMutations);
    } else {
      return apolloClient.mutate({
        mutation: gql`${mutation}`,
        variables
      });
    }
  }
}
