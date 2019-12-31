"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const nock = require("nock");
const should = require("should");
const lib_1 = require("../lib");
let jobProcessor;
describe('jobproc-grapqhl-proc:', () => {
    it('a job processor can be instantiated', () => {
        const job1 = JSON.parse(fs.readFileSync('./test/job1.json', 'utf8'));
        job1.options.processor = new lib_1.GraphQLProcessor({
            entry: 'http://example.com/graphql'
        });
        jobProcessor = new lib_1.JobProcessor(job1);
        should.exist(jobProcessor);
    });
    it('a job should start and process import Users jobs and should run to completion', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const respMessage = {
                data: {
                    createUsers: {
                        regStatus: ['users registered successfully'], error: []
                    }
                }
            };
            nock('http://example.com').post('/graphql').reply(200, respMessage);
            let jobResult = new lib_1.Job();
            jobResult.on('progress', (task) => {
                console.log('Progress:', task.name, task.progress);
            });
            jobResult = yield jobProcessor.start(null, jobResult);
        });
    });
    it('a job should start and process multiple tasks and should run to completion', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const createUsersRespMessage = {
                data: {
                    createUsers: {
                        regStatus: ['All users registered successfully'], error: []
                    }
                }
            };
            const createOrgsRespMessage = {
                data: {
                    createOrganizations: {
                        regStatus: ['All Organizations registered successfully'], error: []
                    }
                }
            };
            const filesToBeFound = 2;
            let filesFound = 0;
            nock('http://example.com').post('/graphql')
                .reply(200, createUsersRespMessage).post('/graphql')
                .reply(200, createOrgsRespMessage);
            const job3 = JSON.parse(fs.readFileSync('./test/job3.json', 'utf8'));
            job3.options.processor = new lib_1.GraphQLProcessor({
                entry: 'http://example.com/graphql'
            });
            jobProcessor = new lib_1.JobProcessor(job3);
            let jobResult = new lib_1.Job();
            jobResult.on('progress', (task) => {
                console.log('Progress:', task.name, task.progress);
                if (task.progress.value === 0) {
                    filesFound++;
                }
            });
            yield jobProcessor.start(null, jobResult);
        });
    });
    it('a job should start and process yml tasks and should run to completion', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const filesToBeFound = 1;
            let filesFound = 0;
            const createRulesRespMessage = {
                data: {
                    createUsers: {
                        regStatus: ['All Rules imported successfully'], error: []
                    }
                }
            };
            const job4 = JSON.parse(fs.readFileSync('./test/job4.json', 'utf8'));
            job4.options.processor = new lib_1.GraphQLProcessor({
                entry: 'http://example.com/graphql'
            });
            nock('http://example.com').post('/graphql')
                .reply(200, createRulesRespMessage);
            jobProcessor = new lib_1.JobProcessor(job4);
            let jobResult = new lib_1.Job();
            jobResult.on('progress', (task) => {
                console.log('Progress:', task.name, task.progress);
                if (task.progress.value === 0) {
                    filesFound++;
                }
            });
            yield jobProcessor.start(null, jobResult);
        });
    });
});
