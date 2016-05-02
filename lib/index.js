'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.promiseDebounce = promiseDebounce;
exports.removeExtFromPath = removeExtFromPath;
exports.ensureJsonExt = ensureJsonExt;
exports.cleanShop = cleanShop;
exports.getParentObject = getParentObject;
exports.returnData = returnData;
exports.getPagesArray = getPagesArray;
exports.default = Shopify;

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _lodash = require('lodash');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = (0, _debug2.default)('shopify-promise-2');

/** wraps promise and rate limits based on second and per second allowance */
function promiseDebounce(fn, delay, count) {
  var working = 0;
  var queue = [];
  function work() {
    if (queue.length === 0 || working === count) return;
    working++;
    _bluebird2.default.delay(delay).tap(function () {
      working--;
    }).then(work);
    var next = queue.shift();
    next[2](fn.apply(next[0], next[1]));
  }
  return function debounced() {
    var args = arguments;
    return new _bluebird2.default(function (resolve) {
      queue.push([this, args, resolve]);
      if (working < count) work();
    }.bind(this));
  };
}

/** removes ext from path */
function removeExtFromPath(thePath) {
  var ext = _path2.default.extname(thePath);
  var base = _path2.default.basename(thePath, ext);
  return _path2.default.join(_path2.default.dirname(thePath), base);
}

/** adds .json to url */
function ensureJsonExt(theUrl) {
  var parsedUrl = _url2.default.parse(theUrl);
  parsedUrl.pathname = removeExtFromPath(parsedUrl.pathname) + '.json';
  return _url2.default.format(parsedUrl);
}

/** cleans shop name by removing myshopify url and protocol */
function cleanShop(shop) {
  var parsed = _url2.default.parse(shop);
  var base = parsed.protocol ? parsed.host : shop;
  return base.split('.')[0];
}

/** gets the parent object (eg. product) from url */
function getParentObject(theUrl) {
  var urlParsed = _url2.default.parse(theUrl);
  var pathname = _path2.default.basename(urlParsed.pathname, '.json');
  var splitPath = pathname.split(_path2.default.sep);
  var parent = (0, _lodash.difference)(splitPath, ['', 'admin'])[0];
  return parent;
}

/** simple return data response for axios */
function returnData(response) {
  return response.data;
}

/** get number of pages in array form given count and limit */
function getPagesArray(count, limit) {
  var pages = Math.ceil(count / limit);
  return (0, _lodash.range)(1, pages + 1);
}

function Shopify(_ref) {
  var shop = _ref.shop;
  var accessToken = _ref.accessToken;
  var password = _ref.password;
  var seconds = _ref.seconds;
  var reqPerSec = _ref.reqPerSec;
  var limit = _ref.limit;

  shop = cleanShop(shop);
  accessToken = accessToken || password;
  seconds = seconds || 1000;
  reqPerSec = reqPerSec || 2;
  limit = limit || 250;

  var instance = _axios2.default.create({
    baseURL: 'https://' + shop + '.myshopify.com/admin',
    headers: { 'X-Shopify-Access-Token': accessToken }
  });

  instance.interceptors.request.use(function (config) {
    config.url = ensureJsonExt(config.url);
    var qs = _querystring2.default.stringify(config.params);
    qs = qs ? '?' + qs : '';
    debug(config.method + ' to ' + config.url + qs);
    return config;
  }, function (error) {
    return _bluebird2.default.reject(error);
  });

  // Add a response interceptor
  instance.interceptors.response.use(function (response) {
    response.parent = getParentObject(response.config.url);
    response.child = Object.keys(response.data)[0];
    return response;
  }, function (error) {
    var err = new Error('Shopify Error');
    err.response = error;
    return _bluebird2.default.reject(err);
  });

  instance.request = _bluebird2.default.method(instance.request);
  instance.request = promiseDebounce(instance.request, seconds, reqPerSec);

  instance._get = function (url, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      'method': 'GET'
    }, config));
  };

  instance.get = function (url, config) {
    return instance._get(url, config).then(returnData);
  };

  instance.getAll = function (url, config) {
    var parent = getParentObject(url);
    return instance.get(parent + '/count', (0, _lodash.defaultsDeep)({
      url: url
    }, config)).then(function (_ref2) {
      var count = _ref2.count;

      debug('count for ' + parent + ' is ' + count);
      var pagesArray = getPagesArray(count, limit);
      return _bluebird2.default.map(pagesArray, function (page) {
        return instance._get(url, (0, _lodash.defaultsDeep)({
          'params': {
            limit: limit,
            page: page
          }
        }, config)).then(function (response) {
          return response.data[response.child];
        });
      }).then(_lodash.flatten);
    }).then(function (responses) {
      var tmp = {};
      tmp[parent] = responses;
      return tmp;
    });
  };

  instance.getWithMetafields = function (url, config) {
    return instance._getWithMetafields(url, config).then(returnData);
  };

  instance._getWithMetafields = function (url, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      'method': 'GET'
    }, config)).then(function (responseObject) {
      var parent = responseObject.parent;
      var id = responseObject.data[responseObject.child].id;
      var commonUrl = parent + '/' + id + '/metafields';
      var theUrl = parent === 'shop' ? '/metafields' : commonUrl;
      return instance.get(theUrl).then(function (_ref3) {
        var metafields = _ref3.metafields;

        responseObject.data[responseObject.child].metafields = metafields;
        return responseObject;
      });
    });
  };

  instance.delete = function (url, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      'method': 'DELETE'
    }, config)).then(returnData);
  };

  instance.head = function (url, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      'method': 'HEAD'
    }, config)).then(returnData);
  };

  instance.post = function (url, data, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      data: data,
      'method': 'POST'
    }, config)).then(returnData);
  };

  instance.put = function (url, data, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      data: data,
      'method': 'PUT'
    }, config)).then(returnData);
  };

  instance.patch = function (url, data, config) {
    return instance.request((0, _lodash.defaultsDeep)({
      url: url,
      data: data,
      'method': 'PATCH'
    }, config)).then(returnData);
  };

  return instance;
}