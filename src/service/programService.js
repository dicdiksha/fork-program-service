const _ = require("lodash");
const uuid = require("uuid/v1");
const logger = require('sb_logger_util_v2');
const SbCacheManager = require('sb_cache_manager');
const messageUtils = require('./messageUtil');
const { successResponse, errorResponse, loggerError } = require('../helpers/responseUtil');
const Sequelize = require('sequelize');
const moment = require('moment');
const loggerService = require('./loggerService');
const Op = Sequelize.Op;
const responseCode = messageUtils.RESPONSE_CODE;
const programMessages = messageUtils.PROGRAM;
const contentMessages = messageUtils.CONTENT;
const contentTypeMessages = messageUtils.CONTENT_TYPE;
const configurationMessages = messageUtils.CONFIGURATION;
const errorCodes = messageUtils.ERRORCODES;
const model = require('../models');
const { from  } = require("rxjs");

const {
  forkJoin
} = require('rxjs');
const { catchError , map } = require('rxjs/operators');
const axios = require("axios");
const envVariables = require('../envVariables');
const RegistryService = require('./registryService')
const ProgramServiceHelper = require('../helpers/programHelper');
const RedisManager = require('../helpers/redisUtil')
const KafkaService = require('../helpers/kafkaUtil')
const publishHelper = require('../helpers/publishHelper')
var async = require('async')

const queryRes_Max = 1000;
const queryRes_Min = 300;
//const stackTrace_MaxLimit = 500;
const HierarchyService = require('../helpers/updateHierarchy.helper');
const { constant } = require("lodash");
const programServiceHelper = new ProgramServiceHelper();
const cacheManager = new SbCacheManager({ttl: envVariables.CACHE_TTL});
const cacheManager_programReport = new SbCacheManager({ttl: 86400});
const registryService = new RegistryService()
const hierarchyService = new HierarchyService()
const UserService = require('./userService');
const userService = new UserService();

function getProgram(req, response) {
 const logObject = {
       traceId : req.headers['x-request-id'] || '',
       message : programMessages.READ.INFO
 }
 loggerService.entryLog(req.body, logObject);

  var rspObj = req.rspObj
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.READ.EXCEPTION_CODE

  model.program.findByPk(req.params.program_id)
    .then(function (res) {
      rspObj.responseCode = responseCode.SUCCESS;
      rspObj.result = res;
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(200).send(successResponse(rspObj));
    })
    .catch(function (error) {
      const sequelizeErrorMessage = _.first(_.get(error, 'errors'));
      rspObj.errCode = programMessages.READ.FAILED_CODE;
      rspObj.errMsg = sequelizeErrorMessage ? sequelizeErrorMessage.message : error.message || programMessages.READ.FAILED_MESSAGE;
      rspObj.responseCode = responseCode.SERVER_ERROR;
      loggerError(rspObj, errCode + errorCodes.CODE1);
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(400).send(errorResponse(rspObj, errCode + errorCodes.CODE2));
    });
}

async function createProgram(req, response) {
  var data = req.body
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.CREATE.INFO
  }
  loggerService.entryLog(data, logObject);
  var rspObj = req.rspObj
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.CREATE.EXCEPTION_CODE

  if (!data.request || !data.request.config || !data.request.type) {
    rspObj.errCode = programMessages.CREATE.MISSING_CODE
    rspObj.errMsg = programMessages.CREATE.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerError(rspObj,errCode+errorCodes.CODE1);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  const insertObj = req.body.request;
  insertObj.program_id = uuid();
  insertObj.config = insertObj.config || {};
  if (!_.isEmpty(insertObj.targetprimarycategories)) {
    insertObj['targetprimarycategorynames'] = _.map(insertObj.targetprimarycategories, 'name');
  }
  if (req.body.request.enddate) {
    insertObj.enddate = req.body.request.enddate
  }

  model.program.create(insertObj).then(sc => {
    rspObj.responseCode = responseCode.SUCCESS;
    rspObj.result = {
      'program_id': insertObj.program_id
    }
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return response.status(200).send(successResponse(rspObj))
  }).catch(error => {
    const sequelizeErrorMessage = _.first(_.get(error, 'errors'));
    rspObj.errCode = programMessages.CREATE.FAILED_CODE;
    rspObj.errMsg = sequelizeErrorMessage ? sequelizeErrorMessage.message : error.message || programMessages.CREATE.FAILED_MESSAGE;
    rspObj.responseCode = responseCode.SERVER_ERROR;
    loggerError(rspObj, errCode + errorCodes.CODE2);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return response.status(500).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
  });
}

function updateProgram(req, response) {
  var data = req.body
  var rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.UPDATE.INFO
  }
 loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.UPDATE.EXCEPTION_CODE

  if (!data.request || !data.request.program_id) {
    rspObj.errCode = programMessages.UPDATE.MISSING_CODE
    rspObj.errMsg = programMessages.UPDATE.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerError(rspObj,errCode+errorCodes.CODE1);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  const updateQuery = {
    where: {
      program_id: data.request.program_id
    },
    returning: true,
    individualHooks: true
  };
  const updateValue = _.cloneDeep(req.body.request);
  if (!updateValue.updatedon) {
    updateValue.updatedon = new Date();
  }
  if (!_.isEmpty(updateValue.targetprimarycategories)) {
    updateValue['targetprimarycategorynames'] = _.map(updateValue.targetprimarycategories, 'name');
  }
  model.program.update(updateValue, updateQuery).then(resData => {
    if (_.isArray(resData) && !resData[0]) {
      rspObj.errCode = programMessages.UPDATE.FAILED_CODE;
      rspObj.errMsg = programMessages.UPDATE.FAILED_MESSAGE;
      rspObj.responseCode = responseCode.SERVER_ERROR;
      loggerError(rspObj, errCode+errorCodes.CODE2);
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(500).send(errorResponse(rspObj, errCode+errorCodes.CODE2));
    }
    rspObj.responseCode = responseCode.SUCCESS;
    rspObj.result = {
      'program_id': updateQuery.where.program_id
    }
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    asyncOnAfterPublish(req, data.request.program_id);
    return response.status(200).send(successResponse(rspObj));
  }).catch(error => {
    console.log(JSON.stringify(error));
    rspObj.errCode = programMessages.UPDATE.FAILED_CODE;
    rspObj.errMsg = programMessages.UPDATE.FAILED_MESSAGE;
    rspObj.responseCode = responseCode.SERVER_ERROR;
    loggerError(rspObj, errCode+errorCodes.CODE3);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return response.status(500).send(errorResponse(rspObj, errCode+errorCodes.CODE3));
  });
}

function publishProgram(req, response) {
  var reqBody = req.body;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.PUBLISH.INFO
  }
  loggerService.entryLog(reqBody, logObject);

  // special header handling for using OCI WAF
  delete req.headers["zen-host"]; 
  // 20230419 by kenneth   
  
  if (!reqBody.request || !reqBody.request.program_id || !reqBody.request.channel) {
    req.rspObj.errCode = programMessages.PUBLISH.MISSING_CODE
    req.rspObj.errMsg = programMessages.PUBLISH.MISSING_MESSAGE
    req.rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerError(req.rspObj,req.rspObj.errCode+errorCodes.CODE1);
    loggerService.exitLog({responseCode: req.rspObj.responseCode, errCode: req.rspObj.errCode+errorCodes.CODE1}, logObject);
    return response.status(400).send(errorResponse(req.rspObj,req.rspObj.errCode+errorCodes.CODE1))
  }
  req.rspObj.errCode = programMessages.EXCEPTION_CODE + '_' + programMessages.PUBLISH.EXCEPTION_CODE

  model.program.findByPk(reqBody.request.program_id)
  .then(function (program) {
    if (_.get(program, 'program_id') && _.get(program, 'type') === 'private') {
      req.rspObj.errCode = programMessages.EXCEPTION_CODE+'_'+contentMessages.UNLISTED_PUBLISH.EXCEPTION_CODE
    }
    if (_.get(program, 'program_id') && (_.get(program, 'target_type') === 'collections' || _.get(program, 'target_type') === null || _.isUndefined(_.get(program, 'target_type')))) {
      programServiceHelper.copyCollections(program, req, response, publishCallback);
    } else if (_.get(program, 'program_id')) {
      publishCallback(null, req, response, program);
    } else {
        loggerService.exitLog({responseCode: 'ERR_PUBLISH_PROGRAM', errCode: req.rspObj.errCode+errorCodes.CODE2}, logObject);
        loggerError(req.rspObj, req.rspObj.errCode+errorCodes.CODE2);
        req.rspObj.responseCode = 'ERR_PUBLISH_PROGRAM';
        req.rspObj.result = 'Program_id Not Found';
        req.rspObj.errMsg = programMessages.PUBLISH.FAILED_MESSAGE;
        return response.status(404).send(errorResponse(req.rspObj, req.rspObj.errCode+errorCodes.CODE2));
    }
  }).catch(function (err) {
    console.log(JSON.stringify(err));
    req.rspObj.responseCode = 'ERR_PUBLISH_PROGRAM';
    req.rspObj.result = err;
    req.rspObj.errMsg = programMessages.PUBLISH.FAILED_MESSAGE;
    loggerService.exitLog({responseCode: req.rspObj.responseCode, errCode: req.rspObj.errCode+errorCodes.CODE5}, logObject);
    loggerError(req.rspObj, req.rspObj.errCode+errorCodes.CODE5);
    return response.status(400).send(errorResponse(req.rspObj, req.rspObjerrCode+errorCodes.CODE5));
  });
}

const publishCallback = function(errObj, req, response, program, copyCollectionRes) {
  let logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : (_.get(program, 'type') === 'public') ? programMessages.PUBLISH.INFO : contentMessages.UNLISTED_PUBLISH.INFO
  }
  if (!errObj && (_.isUndefined(copyCollectionRes) || copyCollectionRes !== null)) {
    const reqHeaders = req.headers;
    program.copiedCollections = [];
      if (copyCollectionRes) {
        program.copiedCollections = _.map(copyCollectionRes, (collection) => {
        return collection.result.content_id;
       });
    }
    const updateValue = {
      status: (_.get(program, 'type') === "public" || _.get(program, 'type') === "restricted") ? "Live" : "Unlisted",
      updatedon: new Date(),
      collection_ids: []
    };

    const collections = _.get(program, 'config.collections');
    if (collections) {
      _.forEach(collections, el => {
        updateValue.collection_ids.push(el.id);
      });
    }
    const updateQuery = {
      where: {
        program_id: program.program_id
      },
      returning: true,
      individualHooks: true,
    };

    model.program.update(updateValue, updateQuery).then(resData => {
      if (_.isArray(resData) && !resData[0]) {
        loggerService.exitLog({responseCode: 'ERR_PUBLISH_PROGRAM', errCode: req.rspObj.errCode+errorCodes.CODE2}, logObject);
        loggerError(req.rspObj, errCode+errorCodes.CODE2);
        req.rspObj.responseCode = 'ERR_PUBLISH_PROGRAM';
        req.rspObj.result = 'Program_id Not Found';
        req.rspObj.errMsg = programMessages.PUBLISH.FAILED_MESSAGE;
        return response.status(404).send(errorResponse(req.rspObj, req.rspObj.errCode+errorCodes.CODE2));
      }
      onAfterPublishProgram(program, reqHeaders, function(afterPublishResponse) {
        if (afterPublishResponse.error) {
          console.log(JSON.stringify(afterPublishResponse.error));
          loggerService.exitLog({responseCode: 'ERR_PUBLISH_PROGRAM', errCode: req.rspObj.errCode+errorCodes.CODE3}, logObject);
          loggerError(req.rspObj, req.rspObj.errCode+errorCodes.CODE2);
          req.rspObj.responseCode = 'ERR_PUBLISH_PROGRAM';
          req.rspObj.result = (_.get(afterPublishResponse.error, 'Error.response.data')) ? _.get(afterPublishResponse.error, 'Error.response.data') : 'On After Publish callback failed';
          return response.status(400).send(errorResponse(req.rspObj, req.rspObj.errCode+errorCodes.CODE2));
        } else {
          loggerService.exitLog({responseCode: 'OK'}, logObject);
          req.rspObj.responseCode = 'OK';
          req.rspObj.result = {
            'program_id': updateQuery.where.program_id,
            afterPublishResponse
          };
          asyncOnAfterPublish(req, updateQuery.where.program_id);
          return response.status(200).send(successResponse(req.rspObj));
        }
    });
    }).catch(error => {
      console.log(JSON.stringify(error));
      loggerService.exitLog({responseCode: 'ERR_PUBLISH_PROGRAM', errCode: req.rspObj.errCode+errorCodes.CODE3}, logObject);
      loggerError(req.rspObj, req.rspObj.errCode+errorCodes.CODE3);
      req.rspObj.responseCode = 'ERR_PUBLISH_PROGRAM';
      req.rspObj.result = error;
      req.rspObj.errMsg = programMessages.PUBLISH.FAILED_MESSAGE;
      return response.status(400).send(errorResponse(req.rspObj, req.rspObj.errCode+errorCodes.CODE3));
    });
  }
  else {
    loggerError(req.rspObj, req.rspObj.errCode+errorCodes.CODE4);
    loggerService.exitLog({responseCode: errObj.responseCode, errCode: req.rspObj.errCode+errorCodes.CODE4}, logObject);
    return response.status(400).send(errorResponse(errObj,req.rspObj.errCode+errorCodes.CODE4));
  }
};

/*function unlistPublishProgram(req, response) {
  var data = req.body;
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : contentMessages.UNLISTED_PUBLISH.INFO
  }
 loggerService.entryLog(data, logObject);
 const errCode = programMessages.EXCEPTION_CODE+'_'+contentMessages.UNLISTED_PUBLISH.EXCEPTION_CODE
  if (!data.request || !data.request.program_id || !data.request.channel) {
    rspObj.errCode = programMessages.PUBLISH.MISSING_CODE
    rspObj.errMsg = programMessages.PUBLISH.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode, errCode: errCode+errorCodes.CODE1}, logObject);
    loggerError('', rspObj, errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }

  model.program.findByPk(data.request.program_id)
  .then(function (res) {
    if (_.get(res, 'target_type') === 'collections') {
      programServiceHelper.copyCollections(res, data.request.channel, req.headers, publishCallback);
    } else {
      let callbackParam = {};
      callbackParam.reqHeaders = req.headers;
      callbackParam.program = res;
      callbackParam.responseCode = 'OK';
      callbackParam.result = {};
      publishCallback(null, callbackParam);
    }
  })
  .catch(function (err) {
    console.log(JSON.stringify(err));
    loggerService.exitLog({responseCode: 'ERR_PUBLISH_PROGRAM', errCode: errCode+errorCodes.CODE5}, logObject);
    loggerError('', rspObj, errCode+errorCodes.CODE5);
    return response.status(400).send(errorResponse({
      apiId: 'api.program.publish',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'ERR_PUBLISH_PROGRAM',
      result: err
    },errCode+errorCodes.CODE5));
  });
}*/

function getOsOrgForRootOrgId(rootorg_id, userRegData, reqHeaders) {
    console.log("DEBUG: entered getOsOrgForRootOrgId - dump request header");
    console.error(JSON.stringify(reqHeaders));
    let returnRes = {};
    // for some reason if user is not mapped to the osOrg where orgId = rootOrg_id,
    return new Promise((resolve, reject) => {
      console.log("DEBUG: entered getOsOrgForRootOrgId - enter promise");
      let osOrgforRootOrgInRegData = {}
      if (!_.isEmpty(_.get(userRegData, 'Org'))) {
        returnRes['osOrgforRootOrg'] =  _.find(_.get(userRegData, 'Org'), {
          orgId: rootorg_id
        });
      }
      if (!_.isEmpty(returnRes['osOrgforRootOrg'])) {
        returnRes['orgFoundInRegData'] = true;
        return resolve(returnRes);
      } else {
        returnRes['orgFoundInRegData'] = false;
        let orgRequest = {
          entityType: ["Org"],
          filters: {
            orgId: {
              eq: rootorg_id
            }
          }
        }
        const osOrgSeachErr = {"error": true, "msg": "OS search error: Error while searching OsOrg for orgId ${rootorg_id}"};
        console.log("DEBUG: getOsOrgForRootOrgId: calling searchRegistry");
        console.error(JSON.stringify(orgRequest));
        searchRegistry(orgRequest, reqHeaders).then((orgRes)=> {
          console.log("DEBUG: entered getOsOrgForRootOrgId - OS search error: Error while searching OsOrg for orgId 375");
          if (orgRes && orgRes.status == 200) {
            if (orgRes.data.result.Org.length > 0) {
              returnRes['osOrgforRootOrg'] = _.first(orgRes.data.result.Org);
              return resolve(returnRes);
            } else {
              returnRes['osOrgforRootOrg'] = {};
              return resolve(returnRes);
            }
          } else {
            return reject(osOrgSeachErr);
          }
        }, (res3Error)=> {
          console.log("DEBUG: getOsOrgForRootOrgId: org search error 391");
          return reject(res3Error || osOrgSeachErr);
        }).catch((error)=>{
          console.log("DEBUG: getOsOrgForRootOrgId: org search error 394");
          return reject(error || osOrgSeachErr);
        });
      }
  })
}

function onAfterPublishProgram(programDetails, reqHeaders, afterPublishCallback) {
  console.log("DEBUG: onAfterPublishProgram: entering onAfterPublishProgram - create null results");
  const onPublishResult = {};
  onPublishResult['nomination']= {};
  onPublishResult['userMapping']= {};
  console.log("DEBUG: onAfterPublishProgram: calling getUserRegistryDetails");
  console.log(JSON.stringify(programDetails.createdby));
  console.log(JSON.stringify(reqHeaders));
  getUserRegistryDetails(programDetails.createdby).then((userRegData) => {
    console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: calling getOsOrgForRootOrgId");
    console.log(JSON.stringify(programDetails));
    console.log(JSON.stringify(userRegData));
    getOsOrgForRootOrgId(programDetails.rootorg_id, userRegData, reqHeaders).then(async (osOrgforRootOrgRes) => {
      console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId - entered");
      const iforgFoundInRegData = osOrgforRootOrgRes.orgFoundInRegData;
      const osOrgforRootOrg = osOrgforRootOrgRes.osOrgforRootOrg;
      const userOsid = _.get(userRegData, 'User.osid');
      const contribMapped = _.find(userRegData.User_Org, function(o) { return o.roles.includes('user') || o.roles.includes('admin') });
      console.log(iforgFoundInRegData);
      console.log(osOrgforRootOrg);
      console.log(userOsid);
      console.log(contribMapped);
      console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId - check the values");
      if (userOsid && iforgFoundInRegData && !_.isEmpty(osOrgforRootOrg)) {
        // When in opensaber user is mapped to the org with OrgId as rootOrgId
        console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId - empty - add or update DB via opensber");
        addOrUpdateNomination(programDetails, programDetails.createdby, osOrgforRootOrg.osid).then ((nominationRes) => {
          onPublishResult.nomination['error'] = null;
          onPublishResult.nomination['result'] = nominationRes;
          afterPublishCallback(onPublishResult);
        }).catch((error) => {
          console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId - empty - error when update opensber");
          onPublishResult.nomination['error'] = error;
          onPublishResult.nomination['result'] = {};
          afterPublishCallback(onPublishResult);
        });
        /*const rspObj = {};
        rspObj.result = userRegData;
        rspObj.result.User_Org.orgId = osOrgforRootOrg.osid;
        rspObj.result.programDetails = programDetails;
        rspObj.result.reqHeaders = reqHeaders;
        rspObj.error = {};
        rspObj.responseCode = 'OK';
        regMethodCallback(null, rspObj)*/
      } else if (userOsid && !iforgFoundInRegData && !_.isEmpty(osOrgforRootOrg)) {
        // When in opensaber user is *not mapped to the org with OrgId as rootOrgId, but we found a org with orgId as rootorgId through query
        // We can map that user to the found org only when user is not mapped to any other org as 'user' or 'admin'
        console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId - opensaber user is not MAPPED - map the user to org");
        if (!_.isEmpty(contribMapped)) {
          addOrUpdateNomination(programDetails, programDetails.createdby, osOrgforRootOrg.osid).then ((nominationRes) => {
            console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination - user mapped, return result");
            onPublishResult.nomination['error'] = null;
            onPublishResult.nomination['result'] = nominationRes;
            afterPublishCallback(onPublishResult);
          }).catch((error) => {
            console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination - error mapping user");
            onPublishResult.nomination['error'] = error;
            onPublishResult.nomination['result'] = {};
            afterPublishCallback(onPublishResult);
          });
        } else {
          // map user to the org as admin
          let regReq = {
            body: {
              id: "open-saber.registry.create",
              request: {
                User_Org: {
                  userId: userOsid,
                  orgId: osOrgforRootOrg.osid,
                  roles: ['admin']
                }
              }
            }
          }
          registryService.addRecord(regReq, (userOrgErr, userOrgRes) => {
            if (!userOrgErr && userOrgRes && userOrgRes.status == 200 &&
              !_.isEmpty(_.get(userOrgRes.data, 'result')) && _.get(userOrgRes.data, 'result.User_Org.osid')) {
                addOrUpdateNomination(programDetails, programDetails.createdby, osOrgforRootOrg.osid).then ((nominationRes) => {
                  onPublishResult.nomination['error'] = null;
                  onPublishResult.nomination['result'] = nominationRes;
                  afterPublishCallback(onPublishResult);
                }).catch((error) => {
                  console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination: addOrUpdateNomination - error mapping user");
                  onPublishResult.nomination['error'] = error;
                  onPublishResult.nomination['result'] = {};
                  afterPublishCallback(onPublishResult);
                });
            } else if (userOrgErr) {
              onPublishResult['error'] = userOrgErr;
              afterPublishCallback(onPublishResult);
             }
          })
        }
      } else {
        const  regMethodCallback = (errObj, rspObj) => {
          if (!errObj && rspObj) {
            const userReg = rspObj.result;

            addOrUpdateNomination(programDetails, programDetails.createdby, userReg.User_Org.orgId).then((nominationRes) => {
              onPublishResult.nomination['error'] = null;
              onPublishResult.nomination['result'] = nominationRes;
              afterPublishCallback(onPublishResult);
            }).then((nominationRes) => {
              if (!_.isEmpty(_.get(userReg,'User_Org.orgId'))){
                const filters = {
                  'organisations.organisationId': programDetails.rootorg_id,
                  'organisations.roles': ['ORG_ADMIN', 'CONTENT_REVIEWER', 'CONTENT_CREATOR']
                };
                mapusersToContribOrg(_.get(userReg,'User_Org.orgId'), filters, reqHeaders).then((tempRes)=> {
                  onPublishResult.userMapping['error'] = null;
                  onPublishResult.userMapping['result'] = {
                    count: tempRes.count,
                    rootorg_id: programDetails.rootorg_id,
                    orgOsid: _.get(userReg,'User_Org.orgId'),
                  };
                  console.log({ msg: 'Users added to the contrib org',
                    additionalInfo: {
                    rootorg_id: programDetails.rootorg_id,
                    orgOsid: _.get(userReg,'User_Org.orgId'),
                    res:tempRes
                    }
                  });
                  logger.debug({ msg: 'Users added to the contrib org',
                    additionalInfo: {
                    rootorg_id: programDetails.rootorg_id,
                    orgOsid: _.get(userReg,'User_Org.orgId'),
                    res:tempRes
                    }
                  }, {});


                }).catch((error) => {
                  onPublishResult.userMapping['error'] = error;
                  onPublishResult.userMapping['result'] = { };
                  console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination: addOrUpdateNomination - error mapping user 526");
                  console.log(JSON.stringify(error));
                  logger.error({ msg: 'Error- while adding users to contrib org',
                  additionalInfo: { rootorg_id: programDetails.rootorg_id, orgOsid: _.get(userReg,'User_Org.orgId') } }, {});
                });
              }
            }).catch((error) => {
                console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination: addOrUpdateNomination - error mapping user 533");
                console.log(JSON.stringify(error));
                onPublishResult.nomination['error'] = nominationRes;
                onPublishResult.nomination['result'] = {};
                afterPublishCallback(onPublishResult);
            });
          } else {
            onPublishResult['error'] = errObj;
            afterPublishCallback(onPublishResult);
          }
        }
        const dikshaUserProfilesApiResp = await userService.getDikshaUserProfiles({'headers': reqHeaders}, programDetails.createdby);
        let orgUsersDetails = _.get(dikshaUserProfilesApiResp.data, 'result.response.content');
        // create a registry for the user adn then an org and create mapping for the org as a admin
          if (orgUsersDetails) {
            const userDetails = _.first(orgUsersDetails);
            if (!userOsid && !_.isEmpty(osOrgforRootOrg)) {
              // if user for created by is not present but org for rootOrg id exists
              createUserMappingInRegistry(userDetails, osOrgforRootOrg, regMethodCallback);
            } else if (!userOsid && _.isEmpty(osOrgforRootOrg)) {
              // if user for created by and org for rootOrg id are not present
              createUserOrgMappingInRegistry(userDetails, regMethodCallback);
            } else if (userOsid && _.isEmpty(osOrgforRootOrg)) {
              // if user for created by is present but org for rootOrg id is not present
              createOrgMappingInRegistry(userDetails, userRegData, regMethodCallback);
            }
          } else {
            onPublishResult['error'] = {msg: "error while getting users details from Diksha"};
            afterPublishCallback(onPublishResult);
          }
      }
    })
    .catch((error) => {
      console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination: addOrUpdateNomination - error mapping user 566");
      console.error(JSON.stringify(error));
      onPublishResult['error'] = {"msg": "getOsOrgForRootOrgId failed " + error.message};
      afterPublishCallback(onPublishResult);
    })
  }).catch((error) => {
    console.log("DEBUG: onAfterPublishProgram: getUserRegistryDetails: getOsOrgForRootOrgId: addOrUpdateNomination: addOrUpdateNomination - error mapping user 572");
    console.error(JSON.stringify(error));
    onPublishResult['error'] = error;
    afterPublishCallback(onPublishResult);
  })
}

function createUserMappingInRegistry(userProfile, rootOrgInReg, regMethodCallback) {
  const rspObj = {};
  rspObj.result = {};
  rspObj.error = {};
  rspObj.responseCode = 'OK';

  let regReq = {
    body: {
      id: "open-saber.registry.create",
      request: {
        User: {
          firstName: userProfile.firstName,
          lastName: userProfile.lastName || '',
          userId: userProfile.identifier,
          enrolledDate: new Date().toISOString(),
          channel: userProfile.rootOrgId
        }
      }
    }
  }
  registryService.addRecord(regReq, (userErr, userRes) => {
    if (userRes && userRes.status == 200 && _.get(userRes.data, 'result') && _.get(userRes.data, 'result.User.osid')) {
      rspObj.result['User'] = userRes.data.result.User;
      rspObj.result['Org'] = rootOrgInReg;
      regReq.body.request = {
        User_Org: {
          userId: rspObj.result.User.osid,
          orgId: rspObj.result.Org.osid,
          roles: ['admin']
        }
      };

      registryService.addRecord(regReq, (userOrgErr, userOrgRes) => {
        if (userOrgRes && userOrgRes.status == 200 && _.get(userOrgRes.data, 'result') && _.get(userOrgRes.data, 'result.User_Org.osid')) {
            rspObj.result['User_Org'] = userOrgRes.data.result.User_Org;
            rspObj.result.User_Org.orgId = rspObj.result.Org.osid;
            regMethodCallback(null, rspObj);
        } else {
          rspObj.error = userOrgErr;
          regMethodCallback(true, rspObj);
          logger.error("Encountered some error while searching data")
        }
      });
    } else {
      rspObj.error = userErr;
      regMethodCallback(true, rspObj);
      logger.error("Encountered some error while searching data")
    }
  });
}

function createUserOrgMappingInRegistry(userProfile, regMethodCallback) {
  const rspObj = {};
  rspObj.result = {};
  rspObj.error = {};
  rspObj.responseCode = 'OK';

  let regReq = {
    body: {
      id: "open-saber.registry.create",
      request: {
        User: {
          firstName: userProfile.firstName,
          lastName: userProfile.lastName || '',
          userId: userProfile.identifier,
          enrolledDate: new Date().toISOString(),
          channel: userProfile.rootOrgId
        }
      }
    }
  }
  registryService.addRecord(regReq, (userErr, userRes) => {
    if (userRes && userRes.status == 200 && _.get(userRes.data, 'result') && _.get(userRes.data, 'result.User.osid')) {
          rspObj.result['User'] = userRes.data.result.User;
          const orgName = userProfile.rootOrgName;
          regReq.body.request = {
              Org: {
                name: orgName,
                code: orgName.toUpperCase(),
                createdBy: rspObj.result.User.osid,
                description: orgName,
                type: ["contribute", "sourcing"],
                orgId: userProfile.rootOrgId,
              }
            };
            registryService.addRecord(regReq, (orgErr, orgRes) => {
              if (orgRes && orgRes.status == 200 && _.get(orgRes.data, 'result') && _.get(orgRes.data, 'result.Org.osid')) {
                  rspObj.result['Org'] = orgRes.data.result.Org;
                  regReq.body.request = {
                    User_Org: {
                      userId: rspObj.result.User.osid,
                      orgId: rspObj.result.Org.osid,
                      roles: ['admin']
                    }
                  };

                  registryService.addRecord(regReq, (userOrgErr, userOrgRes) => {
                    if (userOrgRes && userOrgRes.status == 200 && _.get(userOrgRes.data, 'result') && _.get(userOrgRes.data, 'result.User_Org.osid')) {
                        rspObj.result['User_Org'] = userOrgRes.data.result.User_Org;
                        rspObj.result.User_Org.orgId = rspObj.result.Org.osid;
                        regMethodCallback(null, rspObj);
                    } else {
                      rspObj.error = userOrgErr;
                      regMethodCallback(true, rspObj);
                      logger.error("Encountered some error while searching data")
                    }
                  });
              }else {
                rspObj.error = orgErr;
                regMethodCallback(true, rspObj);
                logger.error("Encountered some error while searching data")
              }
            });
    } else {
      rspObj.error = userErr;
      regMethodCallback(true, rspObj);
      logger.error("Encountered some error while searching data")
    }
  });
}

function createOrgMappingInRegistry(userProfile, userReg, regMethodCallback) {
  const rspObj = {};
  rspObj.error = {};
  rspObj.result = userReg;
  rspObj.responseCode = 'OK';
  const orgName = userProfile.rootOrgName;
  let regReq = {
    body: {
      id: "open-saber.registry.create",
      request: {
        Org: {
          name: orgName,
          code: orgName.toUpperCase(),
          createdBy: rspObj.result.User.osid,
          description: orgName,
          type: ["contribute", "sourcing"],
          orgId: userProfile.rootOrgId,
        }
      }
    }
  }
  registryService.addRecord(regReq, (orgErr, orgRes) => {
    if (orgRes && orgRes.status == 200 && _.get(orgRes.data, 'result') && _.get(orgRes.data, 'result.Org.osid')) {
        rspObj.result['Org'] = orgRes.data.result.Org;
        regReq.body.request = {
          User_Org: {
            userId: rspObj.result.User.osid,
            orgId: rspObj.result.Org.osid,
            roles: ['admin']
          }
        };

        registryService.addRecord(regReq, (userOrgErr, userOrgRes) => {
          if (userOrgRes && userOrgRes.status == 200 && _.get(userOrgRes.data, 'result') && _.get(userOrgRes.data, 'result.User_Org.osid')) {
              rspObj.result['User_Org'] = userOrgRes.data.result.User_Org;
              rspObj.result.User_Org.orgId = rspObj.result.Org.osid;
              regMethodCallback(null, rspObj);
          } else {
            rspObj.error = userOrgErr;
            regMethodCallback(true, rspObj);
            logger.error("Encountered some error while searching data")
          }
        });
    }else {
      rspObj.error = orgErr;
      regMethodCallback(true, rspObj);
      logger.error("Encountered some error while searching data")
    }
  });
}

function addOrUpdateNomination(programDetails, user_id, orgosid) {
  return new Promise((resolve, reject) => {
      const insertObj = {
        program_id: programDetails.program_id,
        user_id: user_id,
        organisation_id: orgosid || null,
        status: 'Approved',
        collection_ids: programDetails.copiedCollections,
      };
      if (!_.isEmpty(programDetails.targetprimarycategories)) {
        insertObj['targetprimarycategories'] = programDetails.targetprimarycategories;
        insertObj['targetprimarycategorynames'] = _.map(programDetails.targetprimarycategories, 'name');
      } else if (!_.isEmpty(programDetails.content_types)) {
        insertObj['content_types'] = programDetails.content_types;
      }
      let findNomWhere =  {
        program_id: programDetails.program_id
      }

      if (orgosid) {
        findNomWhere['organisation_id'] = orgosid;
      }

      if (user_id) {
        findNomWhere['user_id'] = user_id;
      }

      return model.nomination.findOne({
        where: findNomWhere
      }).then((res) => {
          if (res && res.dataValues.id) {
            const updateValue = {
              status: 'Approved',
              collection_ids: programDetails.copiedCollections,
              updatedon: new Date(),
            };

            if (!_.isEmpty(programDetails.targetprimarycategories)) {
              updateValue['targetprimarycategories'] = programDetails.targetprimarycategories;
              insertObj['targetprimarycategorynames'] = _.map(programDetails.targetprimarycategories, 'name');
            } else if (!_.isEmpty(programDetails.content_types)) {
              updateValue['content_types'] = programDetails.content_types;
            }
            const updateQuery = {
              where: findNomWhere,
              returning: true,
              individualHooks: true,
            };

            model.nomination.update(updateValue, updateQuery).then(resData => {
              if (_.isArray(resData) && !resData[0]) {
                return reject({ msg: 'Nomination update failed',additionalInfo: { nomDetails: insertObj }});
              } else {
                return resolve(insertObj);
              }
            }).catch(error => {
                logger.error({ msg: 'Nomination update failed', error, additionalInfo: { nomDetails: insertObj } }, {});
                return reject({ msg: 'Nomination update failed',additionalInfo: { nomDetails: insertObj }});
              });
          } else {
            model.nomination.create(insertObj).then(res => {
              const logFormate = {
                msg: programMessages.LOG_MESSAGES.NOMINATION,
                channel: 'programService',
                level: 'INFO',
                env: 'addOrUpdateNomination',
                actorId: programDetails.createdby,
                params: {}
              }
              console.log("nomination successfully written to DB", JSON.stringify(loggerService.logFormate(logFormate)));
              return resolve(insertObj);
            }).catch(err => {
              logger.error({ msg: 'Nomination creation failed', error, additionalInfo: { nomDetails: insertObj } }, {});
              return reject({ msg: 'Nomination creation failed',additionalInfo: { nomDetails: insertObj }});
            });
          }
      });
  });
}

function getUserRegistryDetails(userId, reqHeaders) {
  console.log("DEBUG: getUserRegistryDetails: Entered getUserRegistryDetails");
  const userRegData = {};
  userRegData['User'] = {};
  console.log("DEBUG: getUserRegistryDetails: setup done userRegData - User");  
  userRegData['Error'] = null;
  console.log("DEBUG: getUserRegistryDetails: setup done userRegData - Error");
  let tempMapping = [];
  console.log("DEBUG: getUserRegistryDetails: setup done tempMapping");
  let userRequest = {
    entityType: ["User"],
    filters: {
      userId: {
        eq: userId
      }
    }
  }
  console.log("DEBUG: getUserRegistryDetails: calling promise");
  return new Promise((resolve, reject) => {
      console.log("DEBUG: getUserRegistryDetails: in promise - call earch registry"); 
      searchRegistry(userRequest, reqHeaders).then((res1)=> {
        if (res1 && res1.status == 200) {
          if (res1.data.result.User.length > 0) {
            userRegData['User'] = res1.data.result.User[0];
            let mapRequest = {
              entityType: ["User_Org"],
              filters: {
                userId: {
                  eq: userRegData.User.osid
                }
              }
            }
            searchRegistry(mapRequest, reqHeaders).then((res2)=> {
              if (res2 && res2.status == 200) {
                tempMapping = res2.data.result.User_Org
                if (tempMapping.length > 0) {
                  const orgIds = _.map(tempMapping, 'orgId');
                  let orgRequest = {
                    entityType: ["Org"],
                    filters: {
                      osid: {
                        or: orgIds
                      }
                    }
                  }
                  searchRegistry(orgRequest, reqHeaders).then((res3)=> {
                    if (res3 && res3.status == 200) {
                      userRegData['Org'] = res3.data.result.Org
                      userRegData['User_Org'] = tempMapping.filter((mapObj) => {
                        return  _.find(userRegData['Org'], {'osid' : mapObj.orgId});
                      });
                      return resolve(userRegData);
                    } else {
                      console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 894"); 
                      userRegData['Error'] = {"error": true, "msg": "OS search error: Error while searching OsOrg for" + userId + ":" + userRegData.User.osid};
                      return reject(userRegData);
                    }
                  }, (res3Error)=> {
                    console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 898"); 
                    userRegData['Error'] = res3Error || {"error": true, "msg": "OS search error: Error while searching OsOrg for" + userId + ":" + userRegData.User.osid};
                    return reject(userRegData);
                  }).catch((error)=>{
                    console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 903"); 
                    userRegData['Error'] = error || {"error": true, "msg": "OS search error: Error while searching OsOrg for" + userId + ":" + userRegData.User.osid};;
                    return reject(userRegData);
                  });
                } else {
                  return resolve(userRegData);
                }
              } else {
                console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 911"); 
                userRegData['Error'] = {"error": true, "msg": "OS search error: Error while searching OsUserOrg for " + userId + ":" + userRegData.User.osid};
                return reject(userRegData);
              }
            },
            (res2error)=> {
              console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 917"); 
              userRegData['Error'] = res2error || {"error": true, "msg": "OS search error: Error while searching OsUserOrg for " + userId + ":" + userRegData.User.osid};
              return reject(userRegData);
            }).catch((error)=> {
              console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 921"); 
              userRegData['Error'] = error || {"error": true, "msg": "OS search error: Error while searching OsUserOrg for " + userId + ":" + userRegData.User.osid};
              return reject(userRegData);
            });
          } else {
            return resolve(userRegData);
          }
        } else {
          console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 929"); 
          userRegData['Error'] = {"error": true, "msg": "OS search error : Error while searching OsUser for " + userId};
          return reject(userRegData);
        }
      }, (res1Error) => {
        userRegData['Error'] = res1Error || {"error": true, "msg": "OS search error : Error while searching OsUser for " + userId};;
        console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 935"); 
        return reject(userRegData);
      }).catch((error) => {
        console.log("DEBUG: getUserRegistryDetails: in promise - searchRegistry error 938"); 
        userRegData['Error'] = error || {"error": true, "msg": "OS search error : Error while searching OsUser for " + userId};;
        return reject(userRegData);
      });
  });
}

function deleteProgram(req, response) {
}

function getProgramCountsByOrg(req, response) {
  var data = req.body
  var rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.PROGRAMCOUNTS_BYORG.PROGRAMCOUNTS_FETCH.INFO
  }
 loggerService.entryLog(data, logObject);
 const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.PROGRAMCOUNTS_BYORG.PROGRAMCOUNTS_FETCH.EXCEPTION_CODE

  rspObj.errCode = programMessages.PROGRAMCOUNTS_BYORG.PROGRAMCOUNTS_FETCH.FAILED_CODE
  rspObj.errMsg = programMessages.PROGRAMCOUNTS_BYORG.PROGRAMCOUNTS_FETCH.FAILED_MESSAGE
  rspObj.responseCode = '';

  const findQuery = (data.request && data.request.filters) ? data.request.filters : {}
  const facets = ["rootorg_id"];
  model.program.findAll({
    where: {
      ...findQuery
    },
    attributes: [...facets, [Sequelize.fn('count', Sequelize.col(facets[0])), 'count']],
    group: [...facets]
  }).then((result) => {
    logger.info("response of the posgresql db = ",result)
      const apiRes = _.keyBy(_.map(result, 'dataValues'), 'rootorg_id');
      const orgIds = _.compact(_.map(apiRes, 'rootorg_id'));
      if (_.isEmpty(result) || _.isEmpty(orgIds)) {
        loggerService.exitLog({responseCode: 'OK'}, logObject);
        return response.status(200).send(successResponse(rspObj));
      }
      logger.info("dbg: get tenant ok - now get org details",orgIds)
      console.log("dbg: get tenant ok - now get org details");
      getOrganisationDetails(req, orgIds).then((orgData) => {
        _.forEach(orgData.data.result.response.content, function(el, index){
          el.program_count = apiRes[el.id].count;
        });
        rspObj.result = orgData.data.result.response;
        loggerService.exitLog({responseCode: 'OK'}, logObject);
        return response.status(200).send(successResponse(rspObj));
      }, (error) => {
        logger.info("dbg: error when calling getOrganisationDetails - follow message does not include upstream error message");
        console.log("dbg: error when calling getOrganisationDetails - follow message does not include upstream error message");
        rspObj.responseCode = responseCode.SERVER_ERROR
        rspObj.errCode = programMessages.PROGRAMCOUNTS_BYORG.ORGSEARCH_FETCH.FAILED_CODE
        rspObj.errMsg = programMessages.PROGRAMCOUNTS_BYORG.ORGSEARCH_FETCH.FAILED_MESSAGE
        loggerError(rspObj,errCode+errorCodes.CODE1);
        rspObj.result = error;
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
      })
  }).catch((err) => {
    rspObj.responseCode = responseCode.SERVER_ERROR
    logger.info({msg:'db error => ',err});
    console.log("db error => ",err);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE2);
    loggerError(err,errCode+errorCodes.CODE2)
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
  });
}

 /* Get the org details by filters*/
 function   getOrganisationDetails(req, orgList) {
  const url = `${envVariables.baseURL}/learner/org/v2/search`;
  const reqData = {
    "request": {
      "filters": {
        "id": orgList,
        "status": 1,
        "isTenant": true
      },
      "fields": ["id", "slug", "orgName", "orgCode", "imgUrl"]
    }
  }
  console.log(url);
  console.log(JSON.stringify(req.headers, null, 2)); 
  console.log(JSON.stringify(reqData, null, 2));
  // if axio throw exception - need to show the real error in the calling function
  // question is how to catch the error and display the result
  // should now just return but enclose the object and handle gracefully 
  //
  // special header handling for using OCI WAF
  delete req.headers["zen-host"]; 
  // 20230415 by kenneth 
  return axios({
    method: 'post',
    url: url,
    headers: req.headers,
    data: reqData
  });
}

async function programList(req, response) {
  var data = req.body
  var rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.READ.INFO
  }
 loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.LIST.EXCEPTION_CODE
  var res_limit = queryRes_Min;
  var res_offset = data.request.offset || 0;
  if (!data.request || !data.request.filters) {
    rspObj.errCode = programMessages.LIST.MISSING_CODE
    rspObj.errMsg = programMessages.LIST.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  if (data.request.limit) {
    res_limit = (data.request.limit < queryRes_Max) ? data.request.limit : (queryRes_Max);
  }

  const filtersOnConfig = ['medium', 'subject', 'gradeLevel'];
  const filters = {};
  filters[Op.and] = _.compact(_.map(data.request.filters, (value, key) => {
    const res = {};
    if (filtersOnConfig.includes(key)) {
      res[Op.or] = _.map(data.request.filters[key], (val) => {
        delete data.request.filters[key];
        return {
          'config' : {
            [Op.contains]: Sequelize.literal(`'{"${key}":["${val}"]}'`)
          }
        };
      });
      return res;
    }
    else if (key === 'content_types' && value) {
      let contentTypes = _.map(data.request.filters[key], (val) => {
        return Sequelize.literal(`'${val}' = ANY (\"program\".\"content_types\")`);
      });

      let targetprimarycategorynames = _.map(data.request.filters[key], (val) => {
        return Sequelize.literal(`'${val}' = ANY (\"program\".\"targetprimarycategorynames\")`);
      });

      res[Op.or] = contentTypes.concat(targetprimarycategorynames);
      delete data.request.filters[key];
      return {
         $and : res
      }
    }
    else if (key === 'target_collection_category' && value) {
      let targetCollectionCategories = _.map(data.request.filters[key], (val) => {
        return Sequelize.literal(`'${val}' = ANY (\"program\".\"target_collection_category\")`);
      });

      res[Op.or] = targetCollectionCategories;
      delete data.request.filters[key];
      return {
         $and : res
      }
    }
    else if ((key === 'nomination_enddate' || key === 'content_submission_enddate') && value) {
      let dateFilterValue;
      switch(value) {
        case 'open':
          dateFilterValue = {[Op.gte]: moment()}
        break;
        case 'closed':
          dateFilterValue = {[Op.lt]: moment()}
        break;
      }
      delete data.request.filters[key];
      return {
        [key]:{
          ...dateFilterValue
        }
      };
    }
  }));

  try {
    if(data.request.filters && data.request.filters.nomination) {
      const resp =  await programServiceHelper.getProgramsForContribution(data, filters);
      return response.status(200).send(successResponse({
        apiId: 'api.program.list',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'OK',
        result: {
          count: resp ? resp.length : 0,
          programs: resp || []
        }
      }));
    }
    else {
      if (data.request.filters && data.request.filters.role && data.request.filters.user_id) {
        const promises = [];
        const roles = data.request.filters.role;
        const user_id = data.request.filters.user_id;
        delete data.request.filters.role;
        delete data.request.filters.user_id;

        _.forEach(roles, (role) => {
            let whereCond = {
              $contains: Sequelize.literal(`cast(rolemapping->>'${role}' as text) like ('%${user_id}%')`),
            };
            promises.push(
              model.program.findAndCountAll({
              where: {
                ...whereCond,
                ...data.request.filters,
                ...filters
              },
              offset: res_offset,
              limit: res_limit,
              order: [
                ['updatedon', 'DESC']
              ]})
          )});
          const res = await Promise.all(promises);
          let aggregatedRes = [];
          _.forEach(res, (response) => {
            _.forEach(response.rows, row => aggregatedRes.push(row));
          })
          aggregatedRes = _.uniqBy(aggregatedRes, 'dataValues.program_id');
          loggerService.exitLog({responseCode: 'OK'}, logObject);
          return response.status(200).send(successResponse({
            apiId: 'api.program.list',
            ver: '1.0',
            msgid: uuid(),
            responseCode: 'OK',
            result: {
              count: aggregatedRes.length,
              programs: aggregatedRes
            }
          }));
        } else {

          const res = await model.program.findAll({
            where: {
              ...filters,
              ...data.request.filters
            },
            attributes: data.request.fields || {
              include : [[Sequelize.json('config.subject'), 'subject'], [Sequelize.json('config.defaultContributeOrgReview'), 'defaultContributeOrgReview'], [Sequelize.json('config.framework'), 'framework'], [Sequelize.json('config.board'), 'board'],[Sequelize.json('config.gradeLevel'), 'gradeLevel'], [Sequelize.json('config.medium'), 'medium'], [Sequelize.json('config.frameworkObj'), 'frameworkObj']],
              exclude: ['config', 'description']
            },
            offset: res_offset,
            limit: res_limit,
            order: [
              ['updatedon', 'DESC']
            ]
          });
          let apiRes = _.map(res, 'dataValues');
          if (data.request.sort){
            apiRes = programServiceHelper.sortPrograms(apiRes, data.request.sort);
          }
          loggerService.exitLog({responseCode: 'OK'}, logObject);
          return response.status(200).send(successResponse({
            apiId: 'api.program.list',
            ver: '1.0',
            msgid: uuid(),
            responseCode: 'OK',
            result: {
              count: apiRes ? apiRes.length : 0,
              programs: apiRes || []
            }
          }));
        }
    }
  }
  catch (err){
    loggerService.exitLog({responseCode: 'ERR_LIST_PROGRAM'}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE4);
    return response.status(400).send(errorResponse({
      apiId: 'api.program.list',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'ERR_LIST_PROGRAM',
      result: err
    },errCode+errorCodes.CODE4));
  }
}

function addNomination(req, response) {
  var data = req.body
  var rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.CREATE.INFO
  }
 loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.NOMINATION.CREATE.EXCEPTION_CODE
  if (!data.request || !data.request.program_id || !data.request.user_id || !data.request.status) {
    rspObj.errCode = programMessages.NOMINATION.CREATE.MISSING_CODE
    rspObj.errMsg = programMessages.NOMINATION.CREATE.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  const insertObj = req.body.request;
  if (!_.isEmpty(insertObj.targetprimarycategories)) {
    insertObj['targetprimarycategorynames'] = _.map(insertObj.targetprimarycategories, 'name');
  }

  model.nomination.create(insertObj).then(res => {
    programServiceHelper.onAfterAddNomination(insertObj.program_id, insertObj.user_id);
    loggerService.exitLog({'program_id': insertObj.program_id}, logObject);
    return response.status(200).send(successResponse({
      apiId: 'api.nomination.add',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'OK',
      result: {
        'program_id': insertObj.program_id,
        'user_id': insertObj.user_id,
        'id': res.dataValues.id
      }
    }));
  }).catch(err => {
    console.log("Error adding nomination to db", JSON.stringify(err));
    loggerService.exitLog({responseCode: 'ERR_CREATE_PROGRAM'}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE2);
    return response.status(400).send(errorResponse({
      apiId: 'api.nomination.add',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'ERR_CREATE_PROGRAM',
      result: err
    },errCode+errorCodes.CODE2));
  });
}

function updateNomination(req, response) {
  var data = req.body
  var rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.UPDATE.INFO
  }
 loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.NOMINATION.UPDATE.EXCEPTION_CODE
  if (!data.request || !data.request.program_id || !(data.request.user_id || data.request.organisation_id)) {
    rspObj.errCode = programMessages.NOMINATION.UPDATE.MISSING_CODE
    rspObj.errMsg = programMessages.NOMINATION.UPDATE.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  const updateQuery = {
    where: {
      program_id: data.request.program_id
    },
    returning: true,
    individualHooks: true
  };
  if(data.request.user_id){
    updateQuery.where.user_id = data.request.user_id
  }
  if(data.request.organisation_id){
    updateQuery.where.organisation_id = data.request.organisation_id
  }
  if(data.request.id){
    updateQuery.where.id =  data.request.id
  }
  var updateValue = req.body.request;
  updateValue = _.omit(updateValue, [
    "id",
    "program_id",
    "user_id",
    "organisation_id"
  ]);
  updateValue.updatedon = new Date();
  if (!_.isEmpty(updateValue.targetprimarycategories)) {
    updateValue['targetprimarycategorynames'] = _.map(updateValue.targetprimarycategories, 'name');
  }
  model.nomination.update(updateValue, updateQuery).then(res => {
    if (_.isArray(res) && !res[0]) {
      loggerService.exitLog({responseCode: 'ERR_UPDATE_NOMINATION'}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE2);
      return response.status(400).send(errorResponse({
        apiId: 'api.nomination.update',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'ERR_UPDATE_NOMINATION',
        result: 'Nomination Not Found'
      },errCode+errorCodes.CODE2));
    }
    const successRes = {
      program_id: updateQuery.where.program_id,
    };
    if(updateQuery.where.user_id){
      successRes.user_id = updateQuery.where.user_id
    }
    if(updateQuery.where.organisation_id){
      successRes.organisation_id = updateQuery.where.organisation_id
    }
    loggerService.exitLog({responseCode: 'OK'}, logObject);
    return response.status(200).send(successResponse({
      apiId: 'api.nomination.update',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'OK',
      result: successRes
    }));
  }).catch(err => {
    loggerService.exitLog({responseCode: 'ERR_UPDATE_NOMINATION'}, logObject);
    console.log("Error updating nomination to db", JSON.stringify(err));
    loggerError(rspObj,errCode+errorCodes.CODE3);
    return response.status(400).send(errorResponse({
      apiId: 'api.nomination.update',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'ERR_UPDATE_NOMINATION',
      result: err
    },errCode+errorCodes.CODE3));
  });
}

function removeNomination(req, response) {
  console.log(req)
}

function getNominationsList(req, response) {
  var data = req.body;
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.LIST.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.NOMINATION.LIST.EXCEPTION_CODE
  var res_limit = 500; // @TODO: for now hardcoded, but need to fix with new wrapper API
  var res_offset = data.request.offset || 0;
  rspObj.errCode = programMessages.NOMINATION.LIST.FAILED_CODE
  rspObj.errMsg = programMessages.NOMINATION.LIST.FAILED_MESSAGE
  rspObj.responseCode = responseCode.SERVER_ERROR
  if (data.request.limit) {
    res_limit = (data.request.limit < queryRes_Max) ? data.request.limit : (queryRes_Max);
  }
  const findQuery = data.request.filters ? data.request.filters : {}
  if (data.request.facets) {
    const facets = data.request.facets;
    model.nomination.findAll({
      where: {
        ...findQuery
      },
      attributes: [...facets, [Sequelize.fn('count', Sequelize.col(facets[0])), 'count']],
      group: [...facets]
    }).then((result) => {
      loggerService.exitLog({responseCode: 'OK'}, logObject);
      return response.status(200).send(successResponse({
        apiId: 'api.nomination.list',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'OK',
        result: result
      }))
    }).catch((err) => {
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE1);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
    })
  }else if (data.request.limit === 0) {
    model.nomination.findAll({
      where: {
        ...findQuery
      },
      attributes: [...data.request.fields || []]
    }).then(async (result) => {
      let aggregatedRes = await aggregatedNominationCount(data, result);
      loggerService.exitLog({responseCode: 'OK'}, logObject);
      return response.status(200).send(successResponse({
        apiId: 'api.nomination.list',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'OK',
        result: aggregatedRes
      }))
    }).catch((err) => {
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE2);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
    })
  } else {
    model.nomination.findAll({
      where: {
        ...findQuery
      },
      offset: res_offset,
      limit: res_limit,
      order: [
        ['updatedon', 'DESC']
      ]
    }).then(async function (result) {
      try {
        var userList = [];
        var orgList = [];
        _.forEach(result, function (data) {
          if(data.user_id) {
            userList.push(data.user_id);
          }

          if (data.organisation_id) {
            orgList.push(data.organisation_id);
          }
        })
        if (_.isEmpty(userList)) {
          loggerService.exitLog({responseCode: 'OK'}, logObject);
          return response.status(200).send(successResponse({
            apiId: 'api.nomination.list',
            ver: '1.0',
            msgid: uuid(),
            responseCode: 'OK',
            result: result
          }))
        }
        const userOrgAPIPromise = [];
        userOrgAPIPromise.push(getUsersDetails(req, userList))
        if(!_.isEmpty(orgList)) {
          userOrgAPIPromise.push(getOrgDetails(req, orgList));
        }

        forkJoin(...userOrgAPIPromise)
        .subscribe((resData) => {
          const allUserData = _.first(resData);
          const allOrgData = userOrgAPIPromise.length > 1 ? _.last(resData) : {};
          if(allUserData && !_.isEmpty(_.get(allUserData, 'data.result.User'))) {
            const listOfUserId = _.map(result, 'user_id');
            _.forEach(allUserData.data.result.User, (userData) => {
              const index = (userData && userData.userId) ? _.indexOf(listOfUserId, userData.userId) : -1;
              if (index !== -1) {
                result[index].dataValues.userData = userData;
              }
            })
          }
          if(allOrgData && !_.isEmpty(_.get(allOrgData, 'data.result.Org'))) {
            const listOfOrgId = _.map(result, 'organisation_id');
            _.forEach(allOrgData.data.result.Org, (orgData) => {
              const index = (orgData && orgData.osid) ? _.indexOf(listOfOrgId, orgData.osid) : -1;
              if (index !== -1) {
                result[index].dataValues.orgData = orgData;
              }
            })
          }
          loggerService.exitLog({responseCode: 'OK'}, logObject);
          return response.status(200).send(successResponse({
            apiId: 'api.nomination.list',
            ver: '1.0',
            msgid: uuid(),
            responseCode: 'OK',
            result: result
          }))
        }, (error) => {
          console.log(JSON.stringify(error));
          loggerService.exitLog(rspObj.responseCode, logObject);
          loggerError(rspObj,errCode+errorCodes.CODE3);
          return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3));
        });
      } catch (err) {
        console.log(JSON.stringify(err));
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        loggerError(rspObj,errCode+errorCodes.CODE4);
        return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE4));
      }
    }).catch(function (err) {
      console.log(JSON.stringify(err));
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE5);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE5));
    });
  }
}

async function downloadProgramDetails(req, res) {
  const data = req.body
  const rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.GENERATE_DETAILS.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.GENERATE_DETAILS.EXCEPTION_CODE
  let programArr = [], promiseRequests = [], cacheData = [], filteredPrograms = [];
  let programObjs = {};
  rspObj.errCode = programMessages.GENERATE_DETAILS.FAILED_CODE
  rspObj.errMsg = programMessages.GENERATE_DETAILS.FAILED_MESSAGE
  rspObj.responseCode = responseCode.SERVER_ERROR
  if (!data.request || !data.request.filters || !data.request.filters.program_id) {
    rspObj.errCode = programMessages.GENERATE_DETAILS.MISSING_CODE
    rspObj.errMsg = programMessages.GENERATE_DETAILS.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
  }
  programArr = _.isArray(data.request.filters.program_id) ? data.request.filters.program_id : [];
  await _.forEach(programArr, (program) => {
    cacheManager.get(`program_details_${program}`, (err, cache) => {
      if (err || !cache) {
        filteredPrograms.push(program);
      } else {
        cacheData.push(cache);
      }
    });
  });

  if (filteredPrograms.length) {
    if (data.request.filters.targetType  && data.request.filters.targetType === 'searchCriteria') {
      await _.forEach(programArr, (programId) => {
        programServiceHelper.getProgramDetails(programId).then((program)=> {
          programObjs[programId] = program;
        });
      });
    }
    // special header handling for using OCI WAF
    delete req.headers["zen-host"]; 
    // 20230415 by kenneth 
    promiseRequests =  _.map(filteredPrograms, (program) => {
      if (!data.request.filters.targetType  || data.request.filters.targetType === 'collections') {
        return [programServiceHelper.getCollectionWithProgramId(program, req), programServiceHelper.getSampleContentWithOrgId(program, req),programServiceHelper.getSampleContentWithCreatedBy(program, req), programServiceHelper.getContributionWithProgramId(program, req), programServiceHelper.getNominationWithProgramId(program), programServiceHelper.getOveralNominationData(program)];
      } else if(data.request.filters.targetType === 'searchCriteria') {
        return[programServiceHelper.getContentContributionsWithProgramId(program, req)];
      }
    });

    forkJoin(..._.flatMapDeep(promiseRequests)).subscribe((responseData) => {
    try{
    const chunkNumber = (!data.request.filters.targetType  || data.request.filters.targetType === 'collections') ? 6 : 1;
    const combainedRes = _.chunk(responseData, chunkNumber);
    const programDetailsArray = programServiceHelper.handleMultiProgramDetails(combainedRes, programObjs, data.request.filters.targetType);
    const tableData  = _.reduce(programDetailsArray, (final, data, index) => {
    final.push({program_id: filteredPrograms[index], values: data});
    return final;
    }, []);
    _.forEach(tableData, (obj) => {
      cacheManager.set({ key: `program_details_${obj.program_id}`, value: obj },
      function (err, cacheCSVData) {
        if (err) {
          logger.error({msg: 'Error - caching', err, additionalInfo: {programDetails: obj}}, req)
        } else {
          logger.debug({msg: 'Caching nomination list - done', additionalInfo: {nominationData: obj}}, req)
        }
    });
    });
    rspObj.result = {
      tableData: [...tableData, ...cacheData]
    }
    rspObj.responseCode = 'OK'
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return res.status(200).send(successResponse(rspObj));
  } catch (err) {
    console.log(JSON.stringify(err));
    loggerError(rspObj,errCode+errorCodes.CODE2);
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
  }
    }, (err) => {
      console.log(JSON.stringify(err));
      loggerError(rspObj,errCode+errorCodes.CODE3);
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3));
    });
  }else {
    rspObj.result = {
      tableData: [...cacheData]
    }
    rspObj.responseCode = 'OK'
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    return res.status(200).send(successResponse(rspObj));
  }
}

function aggregatedNominationCount(data, result) {
  return new Promise((resolve, reject) => {
    try {
     let aggregatedRes = {}
     aggregatedRes['nomination'] = { count: (result) ? result.length : 0 }
     if (result && result.length > 0) {
      const groupData =  _.reduce(result, (final, instance) => {
          _.forEach(data.request.fields, (field) => {
            field !== 'status' ?
              final[field] = _.compact(_.uniq(_.flattenDeep([...final[field] || [], instance[field]]))) :
                final[field] = [...final[field] || [], instance[field]];
          });
          return final;
      }, {});
      aggregatedRes.nomination['fields'] = _.map(data.request.fields, (field) => {
        const obj = {name: field};
        if (field === 'status') {
          obj['fields'] = {}
          const temp = _.groupBy(groupData[field]);
          _.mapKeys(temp, (val, key) => {
            obj.fields[key] = val.length
          })
        }else {
          obj['count'] = groupData[field].length;
        }
        return obj;
      });
    }
     resolve(aggregatedRes);
    } catch(err) {
      reject(err);
    }
  })
 }

 function downloadNominationList(req, response) {
  var data = req.body;
  var rspObj = req.rspObj;
  // special header handling for using OCI WAF
  delete req.headers["zen-host"]; 
  // 20230415 by kenneth  
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.DOWNLOAD_LIST.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.NOMINATION.DOWNLOAD_LIST.EXCEPTION_CODE
  rspObj.errCode = programMessages.NOMINATION.DOWNLOAD_LIST.MISSING_CODE;
  rspObj.errMsg = programMessages.NOMINATION.DOWNLOAD_LIST.MISSING_MESSAGE;
  rspObj.responseCode = responseCode.CLIENT_ERROR;
  if(!data || !data.request || !data.request.filters || !data.request.filters.program_id || !data.request.filters.program_name || !data.request.filters.status) {
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  const reqHeaders = req.headers;
  const findQuery = data.request.filters ? data.request.filters : {};
  cacheManager.get(findQuery.program_id, (err, cacheData) => {
    if(err || !cacheData) {
      model.nomination.findAll({
        where: {
          ..._.omit(findQuery, ["program_name"])
        },
        offset: 0,
        limit: 1000,
        order: [
          ['updatedon', 'DESC']
        ]
      }).then((result) => {
        try {
          let userList = [];
          let orgList = [];
          let relatedContents = [];
          let nominationSampleCounts = {};
          _.forEach(result, r => {
            userList.push(r.user_id);
            if(r.organisation_id) {
              orgList.push(r.organisation_id);
            }
          })
          if(_.isEmpty(userList)) {
            rspObj.result = {
              stats: []
            }
            rspObj.responseCode = 'OK'
            loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
            return response.status(200).send(successResponse(rspObj))
          }
          forkJoin(programServiceHelper.searchContent(findQuery.program_id, true, reqHeaders),
          getUsersDetails(req, userList), getOrgDetails(req, orgList))
            .subscribe(
              (promiseData) => {
                const contentResult = _.first(promiseData);
                if (contentResult && contentResult.data && contentResult.data.result) {
                    const contents = _.compact(_.concat(_.get(contentResult.data.result, 'QuestionSet'), _.get(contentResult.data.result, 'content')));
                    relatedContents = contents;
                }
                nominationSampleCounts = programServiceHelper.setNominationSampleCounts(relatedContents);
                  const userAndOrgResult = _.tail(promiseData, 2);
                _.forEach(userAndOrgResult, function (data) {
                  if (data.data.result && !_.isEmpty(_.get(data, 'data.result.User'))) {
                    _.forEach(data.data.result.User, (userData) => {
                      const index = _.indexOf(_.map(result, 'user_id'), userData.userId)
                      if (index !== -1) {
                        result[index].dataValues.userData = userData;
                      }
                    })
                  }
                  if (data.data.result && !_.isEmpty(_.get(data, 'data.result.Org'))) {
                    _.forEach(data.data.result.Org, (orgData) => {
                      const index = _.indexOf(_.map(result, 'organisation_id'), orgData.osid)
                      if (index !== -1) {
                      result[index].dataValues.orgData = orgData;
                      }
                    })
                  }
                });
                const dataValues = _.map(result, 'dataValues')
                const nominationsWithSamples = programServiceHelper.assignSampleCounts(dataValues, nominationSampleCounts, findQuery.program_name);
                const tableData = programServiceHelper.downloadNominationList(nominationsWithSamples)
                cacheManager.set({ key: findQuery.program_id, value: tableData },
                  function (err, cacheCSVData) {
                    if (err) {
                      logger.error({msg: 'Error - caching', err, additionalInfo: {stats: tableData}}, req)
                    } else {
                      logger.debug({msg: 'Caching nomination list - done', additionalInfo: {stats: cacheCSVData}}, req)
                    }
                })
                rspObj.result = {
                  stats: tableData
                }
                rspObj.responseCode = 'OK'
                loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                return response.status(200).send(successResponse(rspObj))
              },
              (error) => {
                rspObj.errCode = _.get(error, 'response.statusText');
                rspObj.errMsg = _.get(error, 'response.data.message');
                rspObj.responseCode = responseCode.UNAUTHORIZED_ACCESS;
                loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                loggerError(rspObj,errCode+errorCodes.CODE2);
                return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2))
              }
            )
        } catch(error) {
          rspObj.errCode = _.get(error, 'name');
          rspObj.errMsg = _.get(error, 'message');
          rspObj.responseCode = responseCode.SERVER_ERROR;
          loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
          loggerError(rspObj,errCode+errorCodes.CODE3);
          return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3))
        }
      }).catch(error => {
        rspObj.errCode = programMessages.NOMINATION.DOWNLOAD_LIST.QUERY_FAILED_CODE;
        rspObj.errMsg = programMessages.NOMINATION.DOWNLOAD_LIST.QUERY_FAILED_MESSAGE;
        rspObj.responseCode = responseCode.SERVER_ERROR;
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        loggerError(rspObj,errCode+errorCodes.CODE4);
        return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE4))
      })
    }
    else {
      rspObj.result = {
        stats: cacheData
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(200).send(successResponse(rspObj))
    }
  })
}

function getUsersDetails(req, userList) {
  const url = `${envVariables.OPENSABER_SERVICE_URL}/search`;
  const reqData = {
    "id": "open-saber.registry.search",
    "ver": "1.0",
    "ets": "11234",
    "params": {
      "did": "",
      "key": "",
      "msgid": ""
    },
    "request": {
      "entityType": ["User"],
      "filters": {
        "userId": {
          "or": userList
        }
      }
    }
  }

  return axios({
    method: 'post',
    url: url,
    headers: req.headers,
    data: reqData
  });
}

  function searchRegistry(request, reqHeaders) {
    const url = `${envVariables.OPENSABER_SERVICE_URL}/search`;
    const reqData = {
      "id": "open-saber.registry.search",
      "request": request
    }

    return axios({
      method: 'post',
      url: url,
      headers: reqHeaders,
      data: reqData
    });
  }

function updateRegistry(request, reqHeaders) {
  const url = `${envVariables.OPENSABER_SERVICE_URL}/update`;
  const reqData = {
    "id": "open-saber.registry.update",
    "request": request
  }

  return from(axios({
    method: 'post',
    url: url,
    headers: reqHeaders,
    data: reqData
  }));
}

function deleteRegistry(request, reqHeaders) {
  const url = `${envVariables.OPENSABER_SERVICE_URL}/delete`;
  const reqData = {
    "id": "open-saber.registry.delete",
    "request": request
  }

  return from(axios({
    method: 'post',
    url: url,
    headers: reqHeaders,
    data: reqData
  }));
}
function getOrgDetails(req, orgList) {
  const url = `${envVariables.OPENSABER_SERVICE_URL}/search`;
  const reqData = {
    "id": "open-saber.registry.search",
    "ver": "1.0",
    "ets": "11234",
    "params": {
      "did": "",
      "key": "",
      "msgid": ""
    },
    "request": {
      "entityType": ["Org"],
      "filters": {
        "osid": {
          "or": orgList
        }
      }
    }
  }
  // special header handling for using OCI WAF
  delete req.headers["zen-host"]; 
  // 20230415 by kenneth 
  return axios({
    method: 'post',
    url: url,
    headers: req.headers,
    data: reqData
  });
}

async function getUsersDetailsById(req, response) {
  const dikshaUserId = req.params.user_id
  async.waterfall([
    function (callback1) {
      getUserDetailsFromRegistry(dikshaUserId, callback1)
    },
    function (user, callback2) {
      getUserOrgMappingDetailFromRegistry(user, callback2);
    },
    function (user, userOrgMapDetails, callback3) {
      getOrgDetailsFromRegistry(user, userOrgMapDetails, callback3)
    },
    function (user, userOrgMapDetails, orgInfoLists, callback4) {
      createUserRecords(user, userOrgMapDetails, orgInfoLists, callback4)
    }
  ], function (err, res) {
    if (err) {
      return response.status(400).send(errorResponse({
        apiId: 'api.user.read',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'ERR_READ_USER',
        result: err.message || err
      }))

    } else {
      return response.status(200).send(successResponse({
        apiId: 'api.user.read',
        ver: '1.0',
        msgid: uuid(),
        responseCode: 'OK',
        result: res
      }))
    }
  });
}

async function contributorSearch(req, response) {
  var data = req.body;
  var rspObj = req.rspObj;
  const logObject = {
    traceId: req.headers['x-request-id'] || '',
    message: programMessages.CONTRIBUTOR.SEARCH.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.CONTRIBUTOR.SEARCH.EXCEPTION_CODE;
  rspObj.errCode = programMessages.CONTRIBUTOR.SEARCH.MISSING_CODE;
  rspObj.errMsg = programMessages.CONTRIBUTOR.SEARCH.MISSING_MESSAGE;
  rspObj.responseCode = responseCode.CLIENT_ERROR;
  if (!data || !data.request || !data.request.filters || !data.request.filters.user_org || !data.request.filters.user_org.orgId) {
    loggerService.exitLog({ responseCode: rspObj.responseCode }, logObject);
    loggerError(rspObj, errCode + errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj, errCode + errorCodes.CODE1))
  }

  try {
    // Get users associated to org
    const orgUserListResp = await registryService.getOrgUserList(data);
    const orgUserList = _.get(orgUserListResp, 'result');
    const userOsIds = _.uniq(_.map(orgUserList, e => e.userId));

    // Get users list
    const userListApiResp = await registryService.getUserList(data, userOsIds);
    const userList = _.get(userListApiResp.data, 'result.User');

    // Get Diksha user profiles
    const dikshaUserIdentifier = _.uniq(_.map(userList, e => e.userId));

    const dikshaUserProfilesApiResp = await userService.getDikshaUserProfiles(req, dikshaUserIdentifier);
    let orgUsersDetails = _.get(dikshaUserProfilesApiResp.data, 'result.response.content');

    // Attach os user object details to diksha user profile
    if (!_.isEmpty(orgUsersDetails)) {
      const roles = _.get(data.request, 'filters.user_org.roles');
      orgUsersDetails = _.map(
        _.filter(orgUsersDetails, obj => { if (obj.identifier) { return obj; } }),
        (obj) => {
          if (obj.identifier) {
            const tempUserObj = _.find(userList, { 'userId': obj.identifier });
            obj.name = `${ obj.firstName } ${ obj.lastName || '' }`;
            obj.User = _.find(userList, { 'userId': obj.identifier });
            obj.User_Org = _.find(orgUserList, { 'userId': _.get(tempUserObj, 'osid') });
            obj.selectedRole = obj.User_Org && _.first(_.intersection(roles, obj.User_Org.roles));
            return obj;
          }
      });

      const defaultFields =["id","identifier","userId","rootOrgId","userName","status","roles","maskedEmail","maskedPhone","firstName","lastName","name","User","User_Org","stateValidated","selectedRole","channel"];
      const fields = _.get(data.request, 'fields') || [];
      const keys = fields.length > 0 ? fields : defaultFields;
      orgUsersDetails = _.map(orgUsersDetails, e => _.pick(e, keys));
    }

    return response.status(200).send(successResponse({
      apiId: 'api.contributor.search',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'OK',
      result: {
        'contributor': orgUsersDetails,
        'count': _.get(orgUserListResp, 'count')
      }
    }));
  }
  catch (err) {
    console.log(err);
    logger.error({msg: 'Error - contributor search', err}, req)
    return response.status(400).send(errorResponse({
      apiId: 'api.contributor.search',
      apiVersion: '1.0',
      msgId: uuid(),
      responseCode: responseCode.SERVER_ERROR,
      errMsg: err.message || err
    }));
  }
}

function getUserDetailsFromRegistry(value, callback) {
  let userDetailReq = {
    body: {
      id: "open-saber.registry.search",
      request: {
        entityType: ["User"],
        filters: {
          userId: {
            eq: value
          }
        }

      }
    }
  }

  registryService.searchRecord(userDetailReq, (err, res) => {
    if (res) {
      if (res.status == 200) {
        if (res.data.result.User.length > 0) {
          var userDetails = res.data.result.User[0];
          callback(null, userDetails)
        } else {
          callback(null, {});
        }
      } else {
        logger.error("Encountered some error while searching data")
        callback("Encountered some error while searching data")
      }
    } else {
      logger.error("Encountered some error while searching data")
      callback("Encountered some error while searching data")
    }
  });

}


function getUserOrgMappingDetailFromRegistry(user, callback) {

  let userOrgMappingReq = {
    body: {
      id: "open-saber.registry.search",
      request: {
        entityType: ["User_Org"],
        filters: {
          userId: {
            eq: user.osid
          }
        }

      }
    }
  }

  registryService.searchRecord(userOrgMappingReq, (err, res) => {
    if (res) {
      if (res.status == 200) {
        if (res.data.result.User_Org.length > 0) {
          userOrgMapList = res.data.result.User_Org
          callback(null, user, userOrgMapList)
        } else {
          callback(null, user, {})
        }
      } else {
        logger.error("Encountered some error while searching data")
        callback("Encountered some error while searching data")
      }
    } else {
      logger.error("Encountered some error while searching data")
      callback("Encountered some error while searching data")
    }
  });

}

function getOrgDetailsFromRegistry(user, userOrgMapDetails, callback) {

  const orgList = userOrgMapDetails.map((value) => value.orgId)

  let orgDetailsReq = {
    body: {
      id: "open-saber.registry.search",
      request: {
        entityType: ["Org"],
        filters: {
          osid: {
            or: orgList
          }
        }

      }
    }
  }

  registryService.searchRecord(orgDetailsReq, (err, res) => {
    if (res) {
      if (res.status == 200) {
        if (res.data.result.Org.length > 0) {
          orgInfoList = res.data.result.Org
          callback(null, user, userOrgMapList, orgInfoList)
        } else {
          callback("Org Details Not available with org Ids: " + orgList.toString())
        }
      } else {
        logger.error("Encountered some error while searching data")
        callback("Encountered some error while searching data")
      }
    } else {
      logger.error("Encountered some error while searching data")
      callback("Encountered some error while searching data")
    }
  });
}

function createUserRecords(user, userOrgMapDetails, orgInfoList, callback) {

  try {
    orgInfoList.map((org) => {
      var roles = null
      var userOrgOsid = null
      userOrgMapDetails.forEach(function (element, index, array) {
        if (org.osid === element.orgId) {
          roles = element.roles;
          userOrgOsid = element.osid;
        }
      });
      org['userOrgOsid'] = userOrgOsid
      org['roles'] = roles
    });

    user['orgs'] = orgInfoList
    callback(null, user)

  } catch (e) {
    logger.error("Error while parsing for user lists")
    callback("Some Internal processing error while parsing user details", null)
  }


}

function programSearch(req, response) {
}

function getProgramContentTypes(req, response) {
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : contentTypeMessages.FETCH.INFO
  }
  loggerService.entryLog(req.body, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+contentTypeMessages.FETCH.EXCEPTION_CODE
  rspObj.errCode = contentTypeMessages.FETCH.FAILED_CODE
  rspObj.errMsg = contentTypeMessages.FETCH.FAILED_MESSAGE
  rspObj.responseCode = responseCode.SERVER_ERROR
  logger.debug({
    msg: 'Request to program to fetch content types'
  }, req)
  model.contenttypes.findAndCountAll({
    distinct: true,
    col: 'id',
  })
    .then(res => {
      rspObj.result = {
        count: res.count,
        contentType: res.rows
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(200).send(successResponse(rspObj))
    }).catch(error => {
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE1);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
    })
}

function getAllConfigurations(req, response) {
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : configurationMessages.FETCH.INFO
  }
  loggerService.entryLog(req.body, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+configurationMessages.FETCH.EXCEPTION_CODE
  rspObj.errCode = configurationMessages.FETCH.FAILED_CODE
  rspObj.errMsg = configurationMessages.FETCH.FAILED_MESSAGE
  rspObj.responseCode = configurationMessages.SERVER_ERROR
  logger.debug({
    msg: 'Request to fetch program configuration'
  }, req)

  model.configuration.findAndCountAll()
    .then(res => {
      rspObj.result = {
        count: res.count,
        configuration: res.rows
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(200).send(successResponse(rspObj))
    }).catch(error => {
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE1);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
    })
}

function getConfigurationByKey(req, response) {
  var rspObj = req.rspObj;
  var data = req.body;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : configurationMessages.SEARCH.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+configurationMessages.SEARCH.EXCEPTION_CODE
  if(!data || !data.request || !data.request.key  || !data.request.status) {
    rspObj.errCode = configurationMessages.SEARCH.MISSING_CODE
    rspObj.errMsg = configurationMessages.SEARCH.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }
  rspObj.errCode = configurationMessages.FETCH.FAILED_CODE
  rspObj.errMsg = configurationMessages.FETCH.FAILED_MESSAGE
  rspObj.responseCode = configurationMessages.SERVER_ERROR
  logger.debug({
    msg: 'Request to fetch program configuration'
  }, req)

  model.configuration.findAll({
    where: {
      key: data.request.key,
      status: data.request.status
    }
  })
    .then(res => {
      const result = _.first(res)
      rspObj.result = {
        configuration: result ? result.dataValues : []
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(200).send(successResponse(rspObj))
    }).catch(error => {
      rspObj.responseCode = responseCode.CLIENT_ERROR
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE2);
      return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
    })
}

function programUpdateCollection(req, response) {
  const data = req.body
  const rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.LINK.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.LINK.EXCEPTION_CODE
  const url = `${envVariables.SUNBIRD_URL}/action/system/v3/content/update`;
  if (!data.request || !data.request.program_id || !data.request.collection) {
    rspObj.errCode = programMessages.LINK.MISSING_CODE
    rspObj.errMsg = programMessages.LINK.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }

  const updateQuery = {
    "request": {
      "content": {
        "programId": req.body.request.program_id
      }
    }
  }
  // special header handling for using OCI WAF
  delete req.headers["zen-host"]; 
  // 20230415 by kenneth 
  const updateUrls = _.map(req.body.request.collection, collection => {
    return axios({
      method: 'patch',
      url: `${url}/${collection}`,
      headers: req.headers,
      data: updateQuery
    });
  })
  forkJoin(updateUrls).subscribe(resData => {
    const consolidatedResult = _.map(resData, r => r.data.result)
    loggerService.exitLog({responseCode: 'OK'}, logObject);
    return response.status(200).send(successResponse({
      apiId: 'api.program.collection.link',
      ver: '1.0',
      msgid: uuid(),
      responseCode: 'OK',
      result: consolidatedResult
    }));
  }, (error) => {
    rspObj.errCode = programMessages.LINK.MISSING_CODE
    rspObj.errMsg = programMessages.LINK.MISSING_MESSAGE
    rspObj.responseCode = responseCode.RESOURCE_NOT_FOUND
    loggerService.exitLog({responseCode: error.response.data.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE2);
    return response.status(400).send(errorResponse({
      apiId: 'api.program.collection.link',
      ver: '1.0',
      msgId: uuid(),
      errCode: _.get(error, 'response.data.params.err') || rspObj.errCode,
      status: _.get(error, 'response.data.params.status'),
      errMsg: _.get(error, 'response.data.params.errmsg') || rspObj.errMsg,
      responseCode:  _.get(error,'response.data.responseCode') || rspObj.responseCode,
      result: error.response.data.result
    },errCode+errorCodes.CODE2));
  })
}

async function programCopyCollections(req, response) {
  const data = req.body;
  const rspObj = req.rspObj;
  const reqHeaders = req.headers;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.COPY_COLLECTION.COPY.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.COPY_COLLECTION.COPY.EXCEPTION_CODE

  if (!data.request || !data.request.program_id || !data.request.collections || !data.request.allowed_content_types || !data.request.channel) {
    rspObj.errCode = programMessages.COPY_COLLECTION.COPY.MISSING_CODE;
    rspObj.errMsg = programMessages.COPY_COLLECTION.COPY.MISSING_MESSAGE;
    rspObj.responseCode = responseCode.CLIENT_ERROR;
    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1))
  }

  const collections = _.get(data, 'request.collections');
  const collectionIds = _.map(collections, 'id');
  const additionalMetaData = {
    programId: _.get(data, 'request.program_id'),
    allowedContentTypes: _.get(data, 'request.allowed_content_types'),
    channel: _.get(data, 'request.channel'),
    openForContribution: false
  }

  hierarchyService.filterExistingTextbooks(collectionIds, additionalMetaData.programId, reqHeaders)
    .subscribe(
      (resData) => {
        const consolidatedResult = _.map(resData, r => {
          return {
            result: r.data.result,
            config: r.config.data
          }
        })

        const existingTextbooks = hierarchyService.getExistingCollection(consolidatedResult);
        const nonExistingTextbooks = hierarchyService.getNonExistingCollection(consolidatedResult)

        if (existingTextbooks && existingTextbooks.length > 0) {
          hierarchyService.getHierarchy(existingTextbooks, reqHeaders)
            .subscribe(
              (originHierarchyResult) => {
                const originHierarchyResultData = _.map(originHierarchyResult, r => {
                  return _.get(r, 'data')
                })
                const getCollectiveRequest = _.map(originHierarchyResultData, c => {
                  let children = [];
                  const cindex = collections.findIndex(r => r.id === c.hierarchy.content.identifier);

                  if (cindex !== -1) {
                    children = collections[cindex].children;
                  }

                  return hierarchyService.existingHierarchyUpdateRequest(c, additionalMetaData, children);
                })
                hierarchyService.bulkUpdateHierarchy(getCollectiveRequest, reqHeaders)
                  .subscribe(updateResult => {
                    const updateResultData = _.map(updateResult, obj => {
                      return obj.data
                    })
                    rspObj.result = updateResultData;
                    rspObj.responseCode = 'OK'
                    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                    response.status(200).send(successResponse(rspObj))
                  }, error => {
                    rspObj.errCode = programMessages.COPY_COLLECTION.BULK_UPDATE_HIERARCHY.FAILED_CODE;
                      rspObj.errMsg = programMessages.COPY_COLLECTION.BULK_UPDATE_HIERARCHY.FAILED_MESSAGE;
                      rspObj.responseCode = responseCode.SERVER_ERROR
                      console.log('Error updating hierarchy for collections', JSON.stringify(error));
                      if(error && error.response && error.response.data) {
                        console.log(`Error updating hierarchy for collections ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
                      }
                      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                      loggerError(rspObj,errCode+errorCodes.CODE2);
                    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2))
                  })
              }, error => {
                rspObj.errCode = programMessages.COPY_COLLECTION.GET_HIERARCHY.FAILED_CODE;
                  rspObj.errMsg = programMessages.COPY_COLLECTION.GET_HIERARCHY.FAILED_MESSAGE;
                  rspObj.responseCode = responseCode.SERVER_ERROR
                  console.log('Error fetching hierarchy for collections', JSON.stringify(error));
                  if(error && error.response && error.response.data) {
                    console.log(`Error fetching hierarchy for collections ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
                  }
                  loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                  loggerError(rspObj,errCode+errorCodes.CODE3);
                return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3))
              })
        }
        if (nonExistingTextbooks && nonExistingTextbooks.length > 0) {
          hierarchyService.getHierarchy(nonExistingTextbooks, reqHeaders)
            .subscribe(
              (originHierarchyResult) => {
                const originHierarchyResultData = _.map(originHierarchyResult, r => {
                  return _.get(r, 'data')
                })

                hierarchyService.createCollection(originHierarchyResultData, reqHeaders)
                  .subscribe(createResponse => {
                    const originHierarchy = _.map(originHierarchyResultData, 'result.content');

                    const createdCollections = _.map(createResponse, cr => {
                      const mapOriginalHierarchy = {
                        creationResult: cr.data,
                        hierarchy: {
                          ...JSON.parse(cr.config.data).request
                        },
                        originHierarchy: {
                          content: _.find(originHierarchy, {
                            identifier: cr.config.params.identifier
                          })
                        }
                      }
                      mapOriginalHierarchy.hierarchy.content.identifier = cr.config.params.identifier
                      return mapOriginalHierarchy;
                    })
                    const getBulkUpdateRequest = _.map(createdCollections, item => {
                      let children = [];
                      const cindex = collections.findIndex(r => r.id === item.hierarchy.content.identifier);

                      if (cindex !== -1) {
                        children = collections[cindex].children;
                      }

                      return hierarchyService.newHierarchyUpdateRequest(item, additionalMetaData, children)
                    })

                    hierarchyService.bulkUpdateHierarchy(getBulkUpdateRequest, reqHeaders)
                      .subscribe(updateResult => {
                        const updateResultData = _.map(updateResult, obj => {
                          return obj.data
                        })
                        rspObj.result = updateResultData;
                        rspObj.responseCode = 'OK'
                        response.status(200).send(successResponse(rspObj))
                      }, error => {
                        rspObj.errCode = _.get(error.response, 'data.params.err') || programMessages.COPY_COLLECTION.BULK_UPDATE_HIERARCHY.FAILED_CODE;
                        rspObj.errMsg = _.get(error.response, 'data.params.errmsg') || programMessages.COPY_COLLECTION.BULK_UPDATE_HIERARCHY.FAILED_MESSAGE;
                        rspObj.responseCode = _.get(error.response, 'data.responseCode') || responseCode.SERVER_ERROR
                        console.log('Error updating hierarchy for collections', JSON.stringify(error));
                        if(error && error.response && error.response.data) {
                          console.log(`Error updating hierarchy for collections ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
                        }
                        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                        loggerError(rspObj,errCode+errorCodes.CODE4);
                        return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE4))
                      })
                  }, error => {
                    rspObj.errCode = _.get(error.response, 'data.params.err') || programMessages.COPY_COLLECTION.CREATE_COLLECTION.FAILED_CODE;
                    rspObj.errMsg = _.get(error.response, 'data.params.errmsg') || programMessages.COPY_COLLECTION.CREATE_COLLECTION.FAILED_MESSAGE;
                    rspObj.responseCode = _.get(error.response, 'data.responseCode') || responseCode.SERVER_ERROR
                    console.log('Error creating collection', JSON.stringify(error));
                    if(error && error.response && error.response.data) {
                      console.log(`Error creating collection ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
                    }
                    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                    loggerError(rspObj,errCode+errorCodes.CODE5);
                    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE5))
                  })
              }, (error) => {
                rspObj.errCode = programMessages.COPY_COLLECTION.GET_HIERARCHY.FAILED_CODE;
                rspObj.errMsg = programMessages.COPY_COLLECTION.GET_HIERARCHY.FAILED_MESSAGE;
                rspObj.responseCode = responseCode.SERVER_ERROR
                console.log('Error fetching hierarchy for collections', JSON.stringify(error));
                if(error && error.response && error.response.data) {
                  console.log(`Error fetching hierarchy for collections ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
                }
                loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
                loggerError(rspObj,errCode+errorCodes.CODE6);
                return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE6))
              })
        }
      },
      (error) => {
        rspObj.errCode = programMessages.COPY_COLLECTION.SEARCH_DOCK_COLLECTION.FAILED_CODE;
        rspObj.errMsg = error.message || programMessages.COPY_COLLECTION.SEARCH_DOCK_COLLECTION.FAILED_MESSAGE;
        rspObj.responseCode = error.response.statusText || responseCode.SERVER_ERROR
        console.log('Error searching for collections', JSON.stringify(error));
        if(error && error.response && error.response.data) {
          console.log(`Error searching for collections ==> ${additionalMetaData.programId}  ==>`, JSON.stringify(error.response.data));
        }
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        loggerError(rspObj,errCode+errorCodes.CODE7);
        return response.status(error.response.status || 400).send(errorResponse(rspObj,errCode+errorCodes.CODE7))
      }
    )
}


async function generateApprovedContentReport(req, res) {
  const data = req.body
  const rspObj = req.rspObj
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.CONTENT_REPORT.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.CONTENT_REPORT.EXCEPTION_CODE
  let programArr = [], cacheData = [], filteredPrograms = [];
  rspObj.errCode = programMessages.CONTENT_REPORT.FAILED_CODE
  rspObj.errMsg = programMessages.CONTENT_REPORT.FAILED_MESSAGE
  rspObj.responseCode = responseCode.SERVER_ERROR
  if (!data.request || !data.request.filters || !data.request.filters.program_id || !data.request.filters.report) {
    rspObj.errCode = programMessages.CONTENT_REPORT.MISSING_CODE
    rspObj.errMsg = programMessages.CONTENT_REPORT.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR

    loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
    return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
  }
  programArr = _.isArray(data.request.filters.program_id) ? data.request.filters.program_id : [];
  await _.forEach(programArr, (program) => {
    cacheManager_programReport.get(`approvedContentCount_${program}`, (err, cache) => {
      if (err || !cache) {
        filteredPrograms.push(program);
      } else {
        cacheData.push(cache);
      }
    });
  });

  if (filteredPrograms.length) {
    try {
    const openForContribution = data.request.filters.openForContribution || false;
    const requests = _.map(filteredPrograms, program => programServiceHelper.getCollectionHierarchy(req, program, openForContribution));
    const aggregatedResult = await Promise.all(requests);
      _.forEach(aggregatedResult, result => {
        cacheManager_programReport.set({ key: `approvedContentCount_${result.program_id}`, value: result },
        function (err, cacheCSVData) {
          if (err) {
            logger.error({msg: 'Error - caching', err, additionalInfo: {approvedContentCount: result}}, req)
          } else {
            logger.debug({msg: 'Caching  approvedContentCount - done', additionalInfo: {approvedContentCount: result}}, req)
          }
        });
      });

    if (data.request.filters.report === 'textbookLevelReport') {
      const textbookLevelReport = await programServiceHelper.textbookLevelContentMetrics([...aggregatedResult, ...cacheData]);
      rspObj.result = {
        tableData: textbookLevelReport
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return res.status(200).send(successResponse(rspObj));
    } else if (data.request.filters.report === 'chapterLevelReport') {
      const chapterLevelReport = await programServiceHelper.chapterLevelContentMetrics([...aggregatedResult, ...cacheData]);
      rspObj.result = {
        tableData: chapterLevelReport
      }
      rspObj.responseCode = 'OK'
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return res.status(200).send(successResponse(rspObj));
    } else {
      throw 'programServiceException: Invalid report name'
    }
  } catch(err) {
    if (_.includes(err, 'programServiceException')) {
      rspObj.errMsg = err;
    }
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE2);
      return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
    }
  } else {
    try {
      if (data.request.filters.report === 'textbookLevelReport') {
        const textbookLevelReport = await programServiceHelper.textbookLevelContentMetrics([...cacheData]);
        rspObj.result = {
          tableData: textbookLevelReport
        }
        rspObj.responseCode = 'OK'
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        return res.status(200).send(successResponse(rspObj));
      } else if (data.request.filters.report === 'chapterLevelReport') {
        const chapterLevelReport = await programServiceHelper.chapterLevelContentMetrics([...cacheData]);
        rspObj.result = {
          tableData: chapterLevelReport
        }
        rspObj.responseCode = 'OK'
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        return res.status(200).send(successResponse(rspObj));
      } else {
        throw 'programServiceException: Invalid report name'
      }
    }catch(err) {
      if (_.includes(err, 'programServiceException')) {
        rspObj.errMsg = err;
      }
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      loggerError(rspObj,errCode+errorCodes.CODE3);
      return res.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3));
    }
  }
}

function publishContent(req, response){
  var rspObj = req.rspObj;
  const reqHeaders = req.headers;
  var data = req.body;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.CONTENT_PUBLISH.INFO
  }
  loggerService.entryLog(data, logObject);
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.CONTENT_PUBLISH.EXCEPTION_CODE
  if (!data.request || !data.request.content_id || !data.request.origin ||
    !data.request.origin.channel || !data.request.origin.textbook_id || !data.request.origin.units || !data.request.origin.lastPublishedBy) {
    rspObj.errCode = programMessages.CONTENT_PUBLISH.MISSING_CODE
    rspObj.errMsg = programMessages.CONTENT_PUBLISH.MISSING_MESSAGE
    rspObj.responseCode = responseCode.CLIENT_ERROR

    loggerService.exitLog({responseCode: rspObj.responseCode, errCode: rspObj.errCode}, logObject);
    loggerError(rspObj, errCode+errorCodes.CODE1);
    return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE1));
  }

  publishHelper.getContentMetaData(data.request.content_id, reqHeaders)
    .pipe(
      map(responseMetaData => {
        const contentMetaData =  _.get(responseMetaData, 'data.result.content');
        if(!contentMetaData) {
          throw new Error("Fetching content metadata failed!");
        }
        return contentMetaData;
      }),
      catchError(err => {
        // console.log(err)
        throw err;
      })
    )
    .subscribe(
      (contentMetaData) => {
        contentMetaData.channel = _.get(data, 'request.origin.channel') || contentMetaData.channel;
        contentMetaData.lastPublishedBy = _.get(data, 'request.origin.lastPublishedBy') || contentMetaData.lastPublishedBy;
        var units = _.isArray(data.request.origin.units) ? data.request.origin.units : [data.request.origin.units];
        const eventData = publishHelper.getPublishContentEvent(contentMetaData, data.request.origin.textbook_id, units);
        KafkaService.sendRecord(eventData, function (err, res) {
          if (err) {
            console.log(JSON.stringify(err));
            logger.error({ msg: 'Error while sending event to kafka', err, additionalInfo: { eventData } })
            rspObj.errCode = programMessages.CONTENT_PUBLISH.FAILED_CODE
            rspObj.errMsg = 'Error while sending event to kafka'
            rspObj.responseCode = responseCode.SERVER_ERROR
            loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
            loggerError(rspObj,errCode+errorCodes.CODE2);
            return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE2));
          } else {
            rspObj.responseCode = 'OK'
            rspObj.result = {
              'publishStatus': `Publish Operation for Content Id ${data.request.content_id} Started Successfully!`
            }
            loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
            return response.status(200).send(successResponse(rspObj));
          }
        });
      },
      (error) => {
        console.log(JSON.stringify(error));
        rspObj.errCode = programMessages.CONTENT_PUBLISH.FAILED_CODE
        rspObj.errMsg = programMessages.CONTENT_PUBLISH.FAILED_MESSAGE
        rspObj.responseCode = responseCode.SERVER_ERROR
        loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
        loggerError(rspObj,errCode+errorCodes.CODE3);
        return response.status(400).send(errorResponse(rspObj,errCode+errorCodes.CODE3));
      }
    )
}

function getUserOrganisationRoles(profileData, rootorg_id) {
  let userRoles = ['PUBLIC'];
  userRoles = _.uniq(_.union(userRoles, _.map(profileData.roles, 'role')));
  // if (profileData.organisations) {
  //   let thisOrg = _.find(profileData.organisations, {
  //     organisationId: rootorg_id
  //   });
  //   userRoles = _.union(userRoles, thisOrg.roles);
  // }

  return userRoles;
}

function addorUpdateUserOrgMapping(userProfile, filterRootOrg, orgOsid, userOsid, userRegData, callbackFunction) {
  let contribOrgs = [];
  let sourcingOrgs = [];
  let updateOsid = '';
  let uRoles = [];
  const userOrgRoles = getUserOrganisationRoles(userProfile, filterRootOrg);
  const consoleLogs = {};
  consoleLogs[userProfile.identifier] = {};
  consoleLogs[userProfile.identifier]['userName'] = userProfile.userName;
  consoleLogs[userProfile.identifier]['identifier'] = userProfile.identifier;
  consoleLogs[userProfile.identifier]['email'] = userProfile.email;
  consoleLogs[userProfile.identifier]['userRoles'] = userOrgRoles;

  // Check if user is already part of the organisation
  if (!_.isEmpty(_.get(userRegData, 'User_Org'))) {
    _.forEach(_.get(userRegData, 'User_Org'), mappingObj => {
      if (mappingObj.roles.includes('user') || mappingObj.roles.includes('admin')) {
        contribOrgs.push(mappingObj.orgId);
      }
      if (mappingObj.roles.includes('sourcing_reviewer') || mappingObj.roles.includes('sourcing_admin')) {
        sourcingOrgs.push(mappingObj.orgId);
      }

      if (mappingObj.orgId === orgOsid) {
        updateOsid = mappingObj.osid;
        if (userOrgRoles.includes('ORG_ADMIN')) {
          uRoles.push('admin');
        } else {
          uRoles.push('user');
        }
        if (userOrgRoles.includes('CONTENT_REVIEWER')) {
          uRoles.push('sourcing_reviewer');
        }
      }
    });
  }
  consoleLogs[userProfile.identifier]['contribOrgs'] = contribOrgs;
  consoleLogs[userProfile.identifier]['sourcingOrgs'] = sourcingOrgs;

  if (updateOsid) {
    let regReq = {
      body: {
        id: "open-saber.registry.update",
        request: {
          User_Org: {
            osid: updateOsid,
            roles: _.uniq(uRoles)
          }
        }
      }
    }
    consoleLogs[userProfile.identifier]['updatingUserOrgMapping'] = {};
    consoleLogs[userProfile.identifier]['updatingUserOrgMapping']['mappingOsid'] = updateOsid;

    registryService.updateRecord(regReq, (mapErr, mapRes) => {
      if (mapRes && mapRes.status == 200 && _.get(mapRes.data, 'params.status' == "SUCCESSFULL")) {
        consoleLogs[userProfile.identifier]['updatingUserOrgMapping']['mapped'] = true;
        const logFormate = {
          msg: programMessages.LOG_MESSAGES.USERMAPPING.UPDATED,
          channel: 'programService',
          level: 'INFO',
          env: 'addorUpdateUserOrgMapping(updateRecord)',
          actorId: userProfile.identifier,
          params: {userProfile: consoleLogs[userProfile.identifier]}
        }
        console.log(JSON.stringify(loggerService.logFormate(logFormate)));
        callbackFunction(null, updateOsid);
      }
      else {
        consoleLogs[userProfile.identifier]['updatingUserOrgMapping']['mapped'] = false;
        consoleLogs[userProfile.identifier]['updatingUserOrgMapping']['error'] = mapErr;
        console.log(consoleLogs[userProfile.identifier]);
        callbackFunction(mapErr, updateOsid);
        logger.error("Encountered some error while updating data")
      }
    });
  } else if (_.isEmpty(_.get(userRegData, 'User_Org')) || (contribOrgs.length == 0) ||
  (userOrgRoles.includes('CONTENT_REVIEWER') && (sourcingOrgs.length == 0 || (sourcingOrgs.length > 0 && !sourcingOrgs.includes(orgOsid))))) {
    let regReq = {
      body: {
        id: "open-saber.registry.create",
        request: {
          User_Org: {
            userId: userOsid,
            orgId: orgOsid,
            roles: [],
          }
        }
      }
    }
    consoleLogs[userProfile.identifier]['creatingUserOrgMapping'] = {};
    if (contribOrgs.length === 0) {
      if (userOrgRoles.includes('ORG_ADMIN')) {
        regReq.body.request.User_Org.roles.push("admin");
      } else {
        regReq.body.request.User_Org.roles.push("user");
      }
    }

    if (userOrgRoles.includes('CONTENT_REVIEWER') &&
    (sourcingOrgs.length == 0 || (sourcingOrgs.length > 0 && !sourcingOrgs.includes(orgOsid)))) {
      regReq.body.request.User_Org.roles.push("sourcing_reviewer");
    }

    registryService.addRecord(regReq, (mapErr, mapRes) => {
      if (mapRes && mapRes.status == 200 && _.get(mapRes.data, 'result') && _.get(mapRes.data, 'result.User_Org.osid')) {
        consoleLogs[userProfile.identifier]['creatingUserOrgMapping']['mappingOsid'] = _.get(mapRes.data, 'result.User_Org.osid');
        consoleLogs[userProfile.identifier]['creatingUserOrgMapping']['mapped'] = true;
        const logFormate = {
          msg: programMessages.LOG_MESSAGES.USERMAPPING.CREATED,
          channel: 'programService',
          level: 'INFO',
          env: 'addorUpdateUserOrgMapping(addRecord)',
          actorId: userProfile.identifier,
          params: {userProfile: consoleLogs[userProfile.identifier]}
        }
        console.log(JSON.stringify(loggerService.logFormate(logFormate)));
        callbackFunction(null, _.get(mapRes.data, 'result.User_Org.osid'));
      }
      else {
        consoleLogs[userProfile.identifier]['creatingUserOrgMapping']['mapped'] = false;
        consoleLogs[userProfile.identifier]['creatingUserOrgMapping']['error'] = mapErr;
        console.log(consoleLogs[userProfile.identifier]);
        callbackFunction(mapErr, mapRes);
      }
    });
  } else {
    console.log(consoleLogs[userProfile.identifier]);
    callbackFunction(null, null);
  }
}

function mapusersToContribOrg(orgOsid, filters, reqHeaders) {
  let filterRootOrg = filters['organisations.organisationId'];
  let tempRes = {};
  tempRes.error =  false;
  tempRes.result = [];
  var orgUsers = [];
  return new Promise((resolve, reject) => {
    // Get all diskha users
    programServiceHelper.getAllSourcingOrgUsers(orgUsers, filters, reqHeaders)
    .then((sourcingOrgUsers) => {
      if (_.isEmpty(sourcingOrgUsers)) {
        return resolve(tempRes);
      }
      tempRes.count = sourcingOrgUsers.length;
      //_.forEach(sourcingOrgUsers, (userProfile) => {
        for (const userProfile of sourcingOrgUsers) {
          let re = {
            identifier: '',
            User_osid: '',
            Org_osid: '',
            User_Org_osid: '',
            error: {}
          };
          re.identifier = userProfile.identifier;
          getUserRegistryDetails(userProfile.identifier, reqHeaders).then((userRegData) => {
            let userOsid = _.get(userRegData, 'User.osid');
            if (!userOsid) {
              let regReq = {
                body: {
                  id: "open-saber.registry.create",
                  request: {
                    User: {
                      firstName: userProfile.firstName,
                      lastName: userProfile.lastName || '',
                      userId: userProfile.identifier,
                      enrolledDate: new Date().toISOString(),
                      channel: userProfile.rootOrgId
                    }
                  }
                }
              }
              registryService.addRecord(regReq, (userErr, userRes) => {
                if (userRes && userRes.status == 200 && _.get(userRes.data, 'result') && _.get(userRes.data, 'result.User.osid')) {
                  userOsid = _.get(userRes.data, 'result.User.osid');
                  re.User_osid = userOsid;
                  addorUpdateUserOrgMapping(userProfile, filterRootOrg, orgOsid, userOsid, userRegData, function(err, res){
                    if (!err) {
                      re.Org_osid = orgOsid;
                      re.User_Org_osid = res;
                      tempRes.result.push(re);
                      if (checkIfReturnResult(tempRes.result.length, tempRes.count)) {
                        return resolve(tempRes);
                      }
                    } else {
                      tempRes.result.push(re);
                      console.log(JSON.stringify(err));
                      if (checkIfReturnResult(tempRes.result.length, tempRes.count)) {
                        return resolve(tempRes);
                      }
                    }
                  })
                }
                else {
                  console.log(userErr);
                  re.error = { msg: 'Error- adding user into Registry ' + userErr};
                  tempRes.result.push(re);
                  if (checkIfReturnResult(tempRes.result.length, tempRes.count)) {
                    return resolve(tempRes);
                  }
                }
              });
            } else {
              re.User_osid = userOsid;
              addorUpdateUserOrgMapping(userProfile, filterRootOrg, orgOsid, userOsid, userRegData, function(err, res){
                if (!err) {
                  re.Org_osid = orgOsid;
                  re.User_Org_osid = res;
                  tempRes.result.push(re);
                  if (checkIfReturnResult(tempRes.result.length, tempRes.count)) {
                    return resolve(tempRes);
                  }
                } else {
                  re.error = err || {msg: 'Error- addorUpdateUserOrgMapping'};
                  tempRes.result.push(re);
                  console.log(JSON.stringify(err));
                  if (checkIfReturnResult(tempRes.result.length, tempRes.result.count)) {
                    return resolve(tempRes);
                  }
                }
              })
            }
        }).catch(function (err) {
          re.error = err || { msg: 'Error- getUserRegistryDetails '};
          tempRes.result.push(re);
          if (checkIfReturnResult(tempRes.result.length, tempRes.count)) {
            return resolve(tempRes);
          }
        });
      }
    }, (err) => {
      tempRes.error = true;
      tempRes.result = "Error in getting org Users " + err;
      return reject(tempRes);
    });
  });
}

function checkIfReturnResult(iteration, total) {
  if (iteration === total) {
    return true;
  } else {
    return false;
  }
}

function onBeforeMigratingUsers(request) {
  // Get the diskha users for org
  var data = request.body;
  model.program.findAll({
    where: {
      'status': 'Live',
      'rootorg_id': data.request.rootorg_id
    },
    attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('createdby')), 'createdby']],
    offset: 0,
    limit: 1000
  }).then((res) => {
    if (res.length > 0) {
      const userIdArray = _.map(res, 'dataValues.createdby');
      model.nomination.findAll({
        where: {
          'status': 'Approved',
          "user_id": userIdArray
        },
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('organisation_id')), 'organisation_id']],
        offset: 0,
        limit: 1000
      }).then((nomRes) => {
        if (nomRes.length > 0) {
          const osOrgIdArray = _.map(nomRes, 'dataValues.organisation_id');
          const orgOsid = osOrgIdArray[0];
          if (orgOsid) {
            const filters = {
              'organisations.organisationId': data.request.rootorg_id,
              'organisations.roles': ['CONTENT_REVIEWER']
            };
            mapusersToContribOrg(orgOsid, filters, request.headers).then((tempRes)=> {
              logger.debug({ msg: 'Users added to the contrib org',
                additionalInfo: {
                rootorg_id: data.request.rootorg_id,
                orgOsid: orgOsid,
                res:tempRes
                }
              }, {});
            }).catch((error) => {
              console.log(JSON.stringify(error));
              logger.error({ msg: 'Error- while adding users to contrib org',
              additionalInfo: { rootorg_id: data.request.rootorg_id, orgOsid: orgOsid } }, {});
            });
          }
        }
      }).catch((error) => {
        console.log(JSON.stringify(error));
      });
    }
  })
}

function syncUsersToRegistry(req, response) {
  var rspObj = req.rspObj;
  const reqHeaders = req.headers;
  var data = req.body;
  if (!data.request || !data.request.rootorg_id) {
    rspObj.errCode = "SYNC_MISSING_REQUEST"
    rspObj.errMsg = "rootorg_id is not present in the request"
    rspObj.responseCode = responseCode.CLIENT_ERROR
    logger.error({
      msg: 'Error due to missing request and request rootorg_id',
      err: {
        errCode: rspObj.errCode,
        errMsg: rspObj.errMsg,
        responseCode: rspObj.responseCode
      },
      additionalInfo: {
        data
      }
    }, req)
    return response.status(400).send(errorResponse(rspObj,rspObj.errCode))
  }

  var syncRes = {};
  // Get the diskha users for org
  model.program.findAll({
    where: {
      'status': 'Live',
      'rootorg_id': data.request.rootorg_id
    },
    attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('createdby')), 'createdby']],
    offset: 0,
    limit: 1000
  }).then(function (res) {
      if (res.length == 0) {
        return response.status(200).send(successResponse({
          apiId: 'api.program.list',
          ver: '1.0',
          msgid: uuid(),
          responseCode: 'OK',
          result: {}
        }));
      }
      const apiRes = _.map(res, 'dataValues');
      syncRes.projCreators = {};
      syncRes.projCreators.result = [];
      let creatorRes = {};
      let i = 0;
      const userOrgAPIPromise = [];

      _.forEach(apiRes, progObj => {
        creatorRes.identifier = progObj.createdby;
        let userDetailReq = {
          body: {
            id: "open-saber.registry.search",
            request: {
              entityType: ["User"],
              filters: {
                userId: {
                  eq: progObj.createdby
                }
              }
            }
          }
        }
        registryService.searchRecord(userDetailReq, (err, res) => {
          if (res && res.status == 200) {
            if (res.data.result.User.length > 0) {
              const osUser = res.data.result.User[0];
              creatorRes.User_osid = osUser.osid;
              let orgDetailReq = {
                body: {
                  id: "open-saber.registry.search",
                  request: {
                    entityType: ["Org"],
                    filters: {
                      createdBy: {
                        eq: osUser.osid
                      }
                    }
                  }
                }
              }
              registryService.searchRecord(orgDetailReq, (err, res) => {
                creatorRes.Orgs = [];
                if (!err && res && res.status == 200) {
                  if (res.data.result.Org.length > 0) {
                    _.forEach(res.data.result.Org, orgObj => {
                      creatorRes.Orgs.push(orgObj.osid);
                      let request = {
                        Org: {
                          osid: orgObj.osid,
                          orgId: data.request.rootorg_id,
                          type: ["contribute", "sourcing"],
                        }
                      }
                      userOrgAPIPromise.push(updateRegistry(request, reqHeaders));
                    });
                    forkJoin(...userOrgAPIPromise).subscribe((resData) => {
                      i++;
                      creatorRes.sync="SUCCESS";
                      syncRes.projCreators.result.push(creatorRes);
                      if (i == apiRes.length)
                      {
                        rspObj.responseCode = "OK";
                        rspObj.result = syncRes;
                        return response.status(200).send(successResponse(rspObj));
                      }
                    }, (error) => {
                      i++;
                      creatorRes.sync="ERROR";
                      creatorRes.syncError="error";
                      syncRes.projCreators.result.push(creatorRes);

                      if (i == apiRes.length)
                      {
                        rspObj.errMsg = "SYNC_FAILED"
                        rspObj.responseCode = "Failed to get the programs";
                        rspObj.result = syncRes;
                        return response.status(400).send(errorResponse(rspObj,rspObj.errCode));
                      }
                    });
                  }
                  else {
                    i++;
                    syncRes.projCreators.result.push(creatorRes);
                    if (i == apiRes.length)
                    {
                      rspObj.responseCode = "OK";
                      rspObj.result = syncRes;
                      return response.status(200).send(successResponse(rspObj));
                    }
                  }
                } else {
                  i++;
                  creatorRes.error = "Encountered some error while getting Orgs created";
                  console.log("Encountered some error while getting Orgs");
                  syncRes.projCreators.result.push(creatorRes);
                  if (i == apiRes.length)
                  {
                    rspObj.responseCode = "OK";
                    rspObj.result = syncRes;
                    return response.status(200).send(successResponse(rspObj));
                  }
                }
              });
            } else {
              i++;
              creatorRes.error = "User not found in registry " + progObj.createdby ;
              console.log("User not found in registry", progObj.createdby);
              syncRes.projCreators.result.push(creatorRes);
              if (i == apiRes.length)
              {
                rspObj.responseCode = "OK";
                rspObj.result = syncRes;
                return response.status(200).send(successResponse(rspObj));
              }
            }
          } else {
            i++;
            creatorRes.error = "Encountered some error while getting User " + progObj.createdby;
            console.log("Encountered some error while getting User", progObj.createdby);
            syncRes.projCreators.result.push(creatorRes);
            if (i == apiRes.length)
            {
              rspObj.responseCode = "OK";
              rspObj.result = syncRes;
              return response.status(200).send(successResponse(rspObj));
            }
          }
        });
      });
  }).then(onBeforeMigratingUsers(req))
  .catch (function (err) {
      rspObj.errMsg = "SYNC_FAILED"
      rspObj.responseCode = "Failed to get the programs";
      rspObj.result = {};
      loggerService.exitLog({responseCode: rspObj.responseCode}, logObject);
      return response.status(400).send(errorResponse(rspObj,rspObj.errCode));
  });
}


function health(req, response) {
  return response.status(200).send(successResponse({
    apiId: 'api.program.health',
    ver: '1.0',
    msgid: uuid(),
    responseCode: 'OK',
    result: {}
  }));
}



async function asyncOnAfterPublish (req, program_id) {
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.INFO
  }
  const errCode = programMessages.EXCEPTION_CODE+'_'+programMessages.NOMINATION.EXCEPTION_CODE;

  try {
    const res = await model.program.findByPk(program_id);
    const program = _.get(res, 'dataValues');

    if (_.get(program, 'type') === 'restricted' && _.get(program, 'status') === 'Live') {
      const nomination = await model.nomination.findOne({
        where: {
          program_id: program_id,
          user_id: _.get(program, 'createdby')
        }
      });

      const collection_ids = _.get(nomination, 'collection_ids') || [];
      nominateRestrictedContributors(req, program, collection_ids);
    }
  }
  catch(err) {
    console.log('nominate restricted contributor error', JSON.stringify(err))
    if(err.response && err.response.data) {
      console.log(`nominate restricted contributor error ==> ${program.program_id}  ==>`, JSON.stringify(err.response.data));
    }
    rspObj.errCode = programMessages.NOMINATION.CREATE.FAILED_CODE
    rspObj.errMsg = programMessages.NOMINATION.CREATE.FAILED_MESSAGE
    rspObj.responseCode = responseCode.SERVER_ERROR
    loggerService.exitLog(rspObj.responseCode, logObject);
    loggerError(rspObj,errCode+errorCodes.CODE1);
  }
}

/**
 * Nominate restricted contributors
 *
 * @param  program  program data object
 */
 async function nominateRestrictedContributors(req, program, collection_ids) {
  var rspObj = req.rspObj;
  const logObject = {
    traceId : req.headers['x-request-id'] || '',
    message : programMessages.NOMINATION.INFO
  }

  try {
    if (!_.isEmpty(_.get(program, 'config.contributors'))) {
      const orgList = _.get(program, 'config.contributors.Org') || [];
      if (!_.isEmpty(orgList)) {
        // Get org creator diksha ids
        const usersToNotify = [];
        for (const org of orgList) {
          const isNominated = await programServiceHelper.isAlreadyNominated(program.program_id, org.osid);
          if (!isNominated) {
            program['copiedCollections'] = collection_ids;
            addOrUpdateNomination(program, org.User.userId, org.osid);
            usersToNotify.push(org.User);
          }
        }

        if (!_.isEmpty(usersToNotify)) {
          programServiceHelper.notifyRestrictedContributors(req, program, usersToNotify);
        }
      }

      const indList = _.get(program, 'config.contributors.User') || [];
      if (!_.isEmpty(indList)) {
        // Get individual users diksha ids
        const usersToNotify = [];
        for (const ind of indList) {
          const userId = _.get(ind, 'User.userId')
          const isNominated = await programServiceHelper.isAlreadyNominated(program.program_id, undefined, userId);
          if (!isNominated) {
            program['copiedCollections'] = collection_ids;
            addOrUpdateNomination(program, userId);
            usersToNotify.push(ind.User);
          }
        }

        if (!_.isEmpty(usersToNotify)) {
          programServiceHelper.notifyRestrictedContributors(req, program, usersToNotify);
        }
      }
    }
  }
  catch (err) {
    console.log('nominate restricted contributor error', JSON.stringify(err))
    if(err.response && err.response.data) {
      console.log(`nominate restricted contributor error ==> ${program.program_id}  ==>`, JSON.stringify(err.response.data));
    }
    rspObj.errCode = programMessages.NOMINATION.CREATE.FAILED_CODE
    rspObj.errMsg = programMessages.NOMINATION.CREATE.FAILED_MESSAGE
    rspObj.responseCode = responseCode.SERVER_ERROR
    loggerService.exitLog(rspObj.responseCode, logObject);
  }
}

module.exports.syncUsersToRegistry = syncUsersToRegistry
module.exports.getProgramAPI = getProgram
module.exports.createProgramAPI = createProgram
module.exports.updateProgramAPI = updateProgram
module.exports.publishProgramAPI = publishProgram
//module.exports.unlistPublishProgramAPI = unlistPublishProgram
module.exports.deleteProgramAPI = deleteProgram
module.exports.programListAPI = programList
module.exports.addNominationAPI = addNomination
module.exports.programSearchAPI = programSearch
module.exports.updateNominationAPI = updateNomination
module.exports.removeNominationAPI = removeNomination
module.exports.programUpdateCollectionAPI = programUpdateCollection
module.exports.nominationsListAPI = getNominationsList
module.exports.downloadNominationListAPI = downloadNominationList
module.exports.programGetContentTypesAPI = getProgramContentTypes
module.exports.getUserDetailsAPI = getUsersDetailsById
module.exports.contributorSearchAPI = contributorSearch
module.exports.healthAPI = health
module.exports.programCopyCollectionAPI = programCopyCollections;
module.exports.getAllConfigurationsAPI = getAllConfigurations;
module.exports.getConfigurationByKeyAPI = getConfigurationByKey;
module.exports.downloadProgramDetailsAPI = downloadProgramDetails
module.exports.generateApprovedContentReportAPI = generateApprovedContentReport
module.exports.publishContentAPI = publishContent
module.exports.programCountsByOrgAPI = getProgramCountsByOrg
