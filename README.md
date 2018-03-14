# GraphQL Client

The GraphQL client is a client for importing / deleting resources which
internally uses [graphql-request](https://github.com/graphcool/graphql-request)
as GraphQL Client.

Additionally, a job processor is provided which understands a JSON/YAML based
job DSL to describe multiple jobs and run them in a coordinated manner.

## Usage

Create a GraphQL client:

```js
import { Client } from 'gql-bot';
let gqlClient = new Client({
  entry: 'http://example.com/graphql',
  apiKey: 'apiKey'
});
```

Post a GraphQL Request:

```js
// createUsersMutation contains the mutation and list of resoruces
const creatUsersMutation = 'test/folder/createUsers.json';
const response = await gqlClient.post(creatUsersMutation);
```

Refer to [tests](/test/) for more details.

### JSON Fiel format

The JSON files (/test/folder) contain list of resources and the mutation or GraphQL query.

## Job Processor Usage

A job consists of options and a set of tasks and a job processor is used to execute / process the jobs.

### Job Description Example

```js
const jobInfo =
{
  "options": {
    "base": "./test/",
    "concurrency": 2
  },
  "tasks": [
    {
      "operation": "sync",
      "src": "./test/folder/",
      "filter": "createUsers.json",
      "depth": 0,
      "prefix": "graphql",
      "metaData": {
        "cacheControl": "private, max-age=0, no-cache, must-revalidate, proxy-revalidate"
      }
    },
    {
      "operation": "sync",
      "src": "./test/folder/",
      "filter": "createOrganizations.json",
      "depth": 0,
      "prefix": "graphql",
      "metaData": {
        "cacheControl": "private, max-age=0, no-cache, must-revalidate, proxy-revalidate"
      }
    }
  ]
}
```

### Job Format

A job description has the following structure:

- `options.base`: The local base directory relative to which the taks are performed.
- `options.concurrency`: The concurrency at which tasks are processed.
- `options.processor`: An object with a `process(taks)` method returning a promise.

### Task Format

Possible operations:

- `sync` one way synchronization client → server.

### Usage

Create a job processor instance:

```js
import { GraphQLProcessor, JobProcessor, Job } from 'gql-bot';
jobInfo.options.processor = new GraphQLProcessor({
      entry: 'http://example.com/graphql',
      apiKey: 'apiKey'
    });
const jobProcessor = new JobProcessor(jobInfo);
```

Start the job:

```js
let jobResult = new Job();
jobResult.on('progress', (task) => {
  console.log('Progress :', task.name, task.progress);
});
jobResult.on('done', () => {
  done();
});
await jobProcessor.start(jobInfo, jobResult);
```

## Events

`progress`

Task object with progress information:

```js
{
  progress: {
    value: 82,
    item: 'Identifier of the task'
  }
}
```

`error`

Any error emits the error
from the underlying source.

`warn`

Same as for error.
