const _ = require('lodash');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const model = require('../models');
const moment = require('moment');
const axios = require("axios");
const envVariables = require('../envVariables');
const RedisManager = require('./redisUtil');
const keyGenerator = require('./redisKeyGenerator');
const redisManager = new RedisManager();
const config = require('better-config');
config.set('../config.json');
const messageUtils = require('../service/messageUtil');
const programFeedMessages = messageUtils.PROGRAM_FEED;
const loggerService = require('../service/loggerService');

const FEED_EXPIRY_TTL = config.get('dataStores.redis.feedExpiry');

const searchNominations = (query) => {
  return model.nomination.findAll({
    where: {
      program_id: query.program_id,
      status: query.status,
      createdon:{
        [Op.gte]: moment().subtract(query.days, 'days').toDate()
      }
    }
  })
}

const searchContributions = (query, headers) => {
  // remove WAF awared header
  delete headers["zen-host"];
  const request = {
    url: `${envVariables.baseURL}/api/composite/v1/search`,
    method: 'post',
    headers,
    data: {
      "request": {
        "filters": {
          "status": query.status,
          "programId": query.program_id,
          "objectType": "content",
          "createdOn": {
            ">=": moment().subtract(query.days, 'days').toDate()
          },
          "mimeType": {
            "!=": "application/vnd.ekstep.content-collection"
          }
        },
        "not_exists": [
          "sampleContent"
        ],
        "limit": 10000,
        "fields": [
          "programId",
          "name",
          "collectionId",
          "contentType",
          "primaryCategory",
          "status",
          "createdOn"
        ]
      }
    }
  };
  return axios(request)
}

const getNumberOfDays = async (query) => {
  const result = await model.configuration.findAll({
    where: {
      key: query.key,
      status: query.status
    }
  });
  const dataValue = _.first(_.map(result, 'dataValues'));
  const value = dataValue && _.toNumber(dataValue.value);
  return value;
}

const getCollections = (contents, headers) => {
  // remove WAF awared header
  delete headers["zen-host"];
  const collectionIds = _.map(contents, 'collectionId');
  const uniqCollectionIds = _.uniq(collectionIds);
  const request = {
    url: `${envVariables.baseURL}/api/composite/v1/search`,
    method: "post",
    headers,
    data: {
      "request": {
          "filters": {
              "status": [],
              "identifier": uniqCollectionIds
          },
          "limit": 10000,
          "fields": [
              "programId",
              "name",
              "acceptedContents",
              "rejectedContents",
              "contentType",
              "primaryCategory",
              "status",
              "createdOn"
          ]
      }
    }
  }
  return axios(request);
}

const redisCall = (request) =>  Promise.all([...request]);


const splitProgramIdFromKey = (programs, redisKey) => {
  return _.map(programs, program => {
    return program.replace(redisKey.trim(), '');
  })
}

const remap = ({...object}) => {
  const remappedObject = { ...object };
  if(_.has(remappedObject, 'nominationCount')) {
    remappedObject.nominationCount = _.toNumber(object.nominationCount)
  }
  if(_.has(remappedObject, 'contributionCount')) {
    remappedObject.contributionCount = _.toNumber(object.contributionCount)
  }
  return remappedObject
}

const generateUpdatesMap = (updates, countProperty) => {
  const newObject = {}
  const keys = _.isArray(updates) ? updates : _.keys(updates);
  _.forEach(keys, (update) => {
    newObject[update] = {
      [countProperty]: updates[update] ? updates[update].length : 0
    }
  })
  return newObject;
}

const getActionPendingContents = async (contents, headers) => {
  const collection = await getCollections(contents, headers);
  const collectionData = _.get(collection, 'data.result.content');
  const acceptedContents = _.map(collectionData, 'acceptedContents')
  const rejectedContents = _.map(collectionData, 'rejectedContents')
  const acceptedAndRejected = _.uniq(_.compact(_.concat(...acceptedContents, ...rejectedContents)));
  const notActedUponContents = _.filter(contents, (content) => {
    return !_.includes(acceptedAndRejected, content.identifier);
  })
  return notActedUponContents;
}

const findAll = async (programs, stripKey) => {
  const updates = {};
  const client = redisManager.getClient();
  for(const programHash of programs) {
    const cacheResponse = await client.hgetallAsync(programHash);
    if(cacheResponse) {
      updates[programHash.replace(stripKey.trim(), '')] = remap(cacheResponse);
    }
  }
  return _.cloneDeep(updates);
}

const insertAndSetExpiry = async (updates, channel, setChannelExpiry) => {
  const consolidatedCacheRequest = [];
  const setInsert = [];
  const client = redisManager.getClient();
  const programUpdatesChannelKey = keyGenerator.getProgramUpdatesChannelKey(channel)
  let channelTTL;
  if(!setChannelExpiry) {
    channelTTL = await client.ttlAsync(programUpdatesChannelKey);
  }
  let logObject = {
    msg: programFeedMessages.SEARCH.INFO,
    channel: 'program Feed Helper',
    level: 'INFO',
    env: 'programFeedHelper',
    actorId: '',
    params: {updates: `${JSON.stringify(updates)}`}
  }
  console.log(JSON.stringify(loggerService.logFormate(logObject)));
  _.forEach(_.keys(updates), (program) => {
    const programUpdateHashKey = keyGenerator.getProgramUpdatesHashKey(program);
    consolidatedCacheRequest.push({
      hashInsert: client.hmsetAsync(programUpdateHashKey, updates[program]),
      hashExpire: client.expireAsync(programUpdateHashKey, !setChannelExpiry ? channelTTL : FEED_EXPIRY_TTL)
    });
    setInsert.push(programUpdateHashKey);
  })
  logObject.params = {programUpdatesChannelKey: `${programUpdatesChannelKey}`}
  console.log(JSON.stringify(loggerService.logFormate(logObject)));
  logObject.params = {setInsert: `${setInsert}`}
  console.log(JSON.stringify(loggerService.logFormate(logObject)));
  let cacheArray = [..._.map(consolidatedCacheRequest, 'hashInsert'),
  ..._.map(consolidatedCacheRequest, 'hashExpire'),
  client.saddAsync(programUpdatesChannelKey, setInsert)]
  setChannelExpiry && cacheArray.push(client.expireAsync(programUpdatesChannelKey, FEED_EXPIRY_TTL));
  return await redisCall(cacheArray);
}

module.exports = {
  searchNominations,
  searchContributions,
  getCollections,
  redisCall,
  splitProgramIdFromKey,
  remap,
  generateUpdatesMap,
  getActionPendingContents,
  findAll,
  insertAndSetExpiry,
  getNumberOfDays
}
