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
// For test we are using createUsers json file, for processing mutliple jobs
// use the jobproc_grapqhql_proc tests
const createUsersMutation = 'test/folder/createUsers.json';
let client;
describe('client', () => {
    it('should succeed', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const fileData = fs.readFileSync(createUsersMutation).toString();
            // Users registered successfully
            const respMessage = 'registered successfully';
            const compResp = {
                data: {
                    createUsers: {
                        regStatus: ['registered successfully'], error: []
                    }
                }
            };
            nock('http://example.com').post('/graphql').reply(200, compResp);
            client = new lib_1.Client({
                entry: 'http://example.com/graphql'
            });
            const response = yield client.post(fileData);
            console.log('Response is..', response);
            should.exist(response);
            should.exist(response.createUsers);
            should.exist(response.createUsers.regStatus);
            response.createUsers.regStatus.forEach(function (status) {
                status.toString().should.equal(respMessage);
            }, this);
        });
    });
    it('should return a proper error code', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const fileData = fs.readFileSync(createUsersMutation).toString();
            // Users already exists response code
            const respMsg = 'already exist';
            const errorMsg = {
                code: ['003', '003'], message: ['Input user test1 already exist', 'Input user test2 already exist']
            };
            const compResp = {
                data: {
                    createUsers: {
                        regStatus: [], error: [errorMsg]
                    }
                }
            };
            nock('http://example.com').post('/graphql').reply(200, compResp);
            const response = yield client.post(fileData);
            should.exist(response);
            should.exist(response.createUsers);
            should.exist(response.createUsers.error);
            response.createUsers.error.forEach((error) => {
                should.exist(error);
                should.exist(error.code);
                should.exist(error.message);
                error.code.forEach(code => {
                    code.should.equal('003');
                });
                error.message.forEach(msg => {
                    msg.should.containEql(respMsg);
                });
            });
        });
    });
});
