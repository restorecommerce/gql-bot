import * as fs from 'fs';
import * as nock from 'nock';
import * as mocha from 'mocha';
import * as should from 'should';

import { Client } from '../';


// For test we are using createUsers json file, for processing mutliple jobs
// use the jobproc_grapqhql_proc tests
const creatUsersMutation = 'test/folder/createUsers.json';
let client;

describe('client', function () {

  it('adding a User/Array of Users should succeed', async function (done) {
    const fileData = fs.readFileSync(creatUsersMutation).toString();
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

    client = new Client({
      entry: 'http://example.com/graphql'
    });
    const response = await client.post(creatUsersMutation, fileData);
    should.exist(response);
    should.exist(response.createUsers);
    should.exist(response.createUsers.regStatus);
    response.createUsers.regStatus.forEach(function (status) {
      status.toString().should.equal(respMessage);
    }, this);
    done();
  });

  it('adding an User/List of Users should give proper error code when the data already exists', async function (done) {
    const fileData = fs.readFileSync(creatUsersMutation).toString();
    // Users already exists response code
    const respMsg = 'already exist';
    const errorMsg = {
      code: ['003', '003'], message:
      ['Input user test1 already exist', 'Input user test2 already exist']
    };

    const compResp = {
      data: {
        createUsers: {
          regStatus: [], error: [errorMsg]
        }
      }
    };

    nock('http://example.com').post('/graphql').reply(200, compResp);

    const response = await client.post(creatUsersMutation, fileData);
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
    done();
  });


  it('adding a User/List of Users with invalid apiKey should fail', async function (done) {
    const fileData = fs.readFileSync(creatUsersMutation).toString();
    // Invalid api key response code
    const respMsg = 'Invalid API Key, user does not have privileges';
    const errorMsg = {
      code: ['015'], message:
      ['Invalid API Key, user does not have privileges']
    };

    const compResp = { data: { createUsers: { regStatus: [], error: [errorMsg] } } };
    nock('http://example.com').post('/graphql').reply(200, compResp);

    client = new Client({
      entry: 'http://example.com/graphql'
    });

    const response = await client.post(creatUsersMutation, fileData);

    should.exist(response);
    should.exist(response.createUsers);
    should.exist(response.createUsers.error);

    response.createUsers.error.forEach(error => {
      should.exist(error);
      should.exist(error.code);
      should.exist(error.message);
      error.code.forEach(code => {
        code.should.equal('015');
      });
      error.message.forEach(msg => {
        msg.should.equal(respMsg);
      });
    });
    done();
  });

});
