'use strict';

import * as _ from 'lodash';
import * as url from 'url';
import * as fs from 'fs';
import * as qs from 'query-string';
import * as string from 'string';
import * as yaml from 'js-yaml';
import { GraphQLClient, request } from 'graphql-request';

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
    if (!string(entry).startsWith('http')) {
      this.opts.entry = this.opts.protocol + '://' + entry;
    }
    const parsedEntry = url.parse(entry);
    if (parsedEntry.protocol) {
      this.opts.protocol = parsedEntry.protocol;
    }
    const protocol = this.opts.protocol + '//';
    this.entryBaseUrl = protocol + parsedEntry.host + parsedEntry.path;
  }

  _normalizeUrl(iri: string, source?: any): string {
    const localIri = iri || '';
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

  async post(iri: string, source: any, metaData?: any,
    accessControl?: any, formOptions?: any): Promise<any> {
    let mutation;
    let variables;
    let caseExpression;
    source = JSON.parse(source);
    const normalUrl = this._normalizeUrl(iri);

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
        resource_list = resource_list.replace(/\"([^(\")"]+)\":/g, "$1:");
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

    if (mutation)
      mutation = mutation.replace(/\"/g, "");
    variables = [resource_list, apiKey];
    if (checkVariableMutation(mutation)) {
      const queryVarKeys = source.queryVariables.split(',').map(
        function (keyName: String): String {
          return keyName.trim();
        });
      const inputVarName = mutation.slice(mutation.indexOf('$') + 1,
        mutation.indexOf(':'));
      variables = createQueryVariables(inputVarName, queryVarKeys, variables);
    } else {
      // update the muation with inline variables
      mutation = replaceInlineVars(mutation, { resource_list, apiKey });
    }

    const gqlClient = new GraphQLClient(normalUrl, _.pick(this.opts, ['headers', '...others']));
    return gqlClient.request(mutation, variables);
  }
}

function checkVariableMutation(mutation: string): Boolean {
  const mutationName = mutation.slice(mutation.indexOf(' '),
    mutation.indexOf('($'));
  if (mutationName.indexOf('$') > 0) {
    return false;
  } else {
    return new RegExp('\\b' + mutationName + '\\(', 'i').test(mutation);
  }
}

function replaceInlineVars(mutation: string, args: any): string {
  if (mutation)
    return mutation.replace(/\${(\w+)}/g, (_, v) => args[v]);
}

function createQueryVariables(inputVarName: string,
  queryVarKeys: any, varValues: any): Object {
  let result = {};
  // queryVars keys and values lenght should match
  if (queryVarKeys.length === varValues.length) {
    queryVarKeys.forEach((key, i) => result[key] = JSON.parse(varValues[i]));
  }
  return { [inputVarName]: result };
}
