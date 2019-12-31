import * as _ from 'lodash';
import * as ps from 'promise-streams';
import { Readable } from 'stream';
import * as through2 from 'through2';
import * as readdirp from 'readdirp';
import * as path from 'path';
import { EventEmitter } from 'events';

export class ReadArrayStream extends Readable {
  array: any[];
  constructor(opts: any, array: any[]) {
    super(opts);
    this.array = _.clone(array);
  }

  _read(): void {
    if (this.array && this.array.length > 0) {
      const data = this.array.shift();
      this.push(data);
    } else {
      this.push(null);
    }
  }
}

/*
 * A class to represent a job and its end result as promise.
 * It also reports the progress as event emitter.
 */
export class Job extends EventEmitter {
  opts: any;
  constructor(opts?: any) {
    super();
    this.setMaxListeners(100);
    this.opts = opts || {};
  }
}

export class JobProcessor {
  jobInfo: any;
  processed: number;
  processedTasks: number;
  taskStream: any;
  constructor(jobInfo: any) {
    this.jobInfo = jobInfo;
    this.processed = 0;

    _.defaults(this.jobInfo, {
      concurrency: 3,
      processor: null
    });
  }

  async start(tasks?: any, job?: Job): Promise<any> {
    job = job || new Job();
    tasks = tasks || this.jobInfo.tasks;

    const concurrency = this.jobInfo.options.concurrency;
    const thiz = this;
    this.taskStream = ps.map({ concurrent: concurrency }, (task: any) => {
      return thiz.jobInfo.options.processor.process(task).then((body) => {
        console.log('Processed task [' + thiz.processed + '] and status is:' + JSON.stringify(body));
        thiz.processed++;
        task.inputTask.processing--;
        task.progress.value = 100; // task complete
        job.emit('progress', task);
      }).catch((err) => {
        throw err;
      });
    });

    this.taskStream.setMaxListeners(100);
    const inputTaskStream = new ReadArrayStream({
      objectMode: true
    }, tasks);

    inputTaskStream.pipe(through2.obj(async (task, enc, cb) => {
      const operation = task.operation;
      await thiz[operation].apply(thiz, [task, job]);
      cb();
    }));

    await ps.wait(inputTaskStream);

    this.taskStream.on('error', (err) => { throw err; });
    this.taskStream.on('end', () => {
      // console.log('Stream ended');
    });

    const tasksStreamEnded = ps.wait(this.taskStream);

    // Wait until the task stream emitted 'end'
    tasksStreamEnded.then(() => {
      job.emit('done');
    });

    return job;
  }

  async sync(task: any, job: Job): Promise<any> {
    const pathOptions = {
      fileFilter: (entry) => { return true; },
      depth: 1,
      lstat: true
    };
    const pathSegments = [process.cwd()];
    if (!_.isUndefined(this.jobInfo.base)) {
      pathSegments.push(this.jobInfo.base);
    }
    if (!_.isUndefined(task.src)) {
      pathSegments.push(task.src);
    }

    pathOptions.fileFilter = task.filter || pathOptions.fileFilter;

    if (task.depth) {
      pathOptions.depth = task.depth;
    } else {
      delete pathOptions.depth;
    }

    const fileItemStream = readdirp(path.join.apply(this, pathSegments), pathOptions);
    const thiz = this;

    await new Promise((resolve, reject) => {
      fileItemStream
        .on('warn', (warn) => {
          job.emit('warn', warn);
        })
        .on('error', (err) => {
          job.emit('error', err);
        })
        .on('data', (fileItem) => {
          fileItem.progress = {
            value: 0
          };
          _.merge(fileItem, task);
          if (!task.processing) {
            task.processing = 0;
          }
          task.processing++;
          fileItem.inputTask = task;
          job.emit('progress', fileItem);
          resolve(job);
        })
        .on('end', () => {
          if (!thiz.processedTasks) {
            thiz.processedTasks = 0;
          }
          thiz.processedTasks++;
          // Check processedTasks tasks
          // Manually emit `end` event for all tasks finished
          if (thiz.processedTasks === thiz.jobInfo.tasks.length) {
            thiz.taskStream._flush(() => { });
            thiz.taskStream.emit('end');
          }
        })
        .pipe(thiz.taskStream, { end: false });
    });
  }
}
