import querystring from 'querystring'
import Debug from 'debug'
import path from 'path'
import url from 'url'
import Promise from 'bluebird'
import axios from 'axios'
import { defaultsDeep,  difference, range, flatten } from 'lodash'

let debug = Debug('shopify-promise-2')

/** wraps promise and rate limits based on second and per second allowance */
export function promiseDebounce (fn, delay, count) {
  var working = 0, queue = []
  function work() {
    if ((queue.length === 0) || (working === count)) return
    working++
    Promise.delay(delay).tap(function () { working-- }).then(work)
    var next = queue.shift()
    next[2](fn.apply(next[0], next[1]))
  }
  return function debounced () {
    var args = arguments
    return new Promise(function(resolve){
      queue.push([this, args, resolve])
      if (working < count) work()
    }.bind(this))
  }
}

/** removes ext from path */
export function removeExtFromPath (thePath) {
  let ext = path.extname(thePath)
  let base = path.basename(thePath, ext)
  return path.join(path.dirname(thePath), base)
}

/** adds .json to url */
export function ensureJsonExt (theUrl) {
  let parsedUrl = url.parse(theUrl)
  parsedUrl.pathname = removeExtFromPath(parsedUrl.pathname) + '.json'
  return url.format(parsedUrl)
}

/** cleans shop name by removing myshopify url and protocol */
export function cleanShop (shop) {
  let parsed = url.parse(shop)
  let base = (parsed.protocol) ? parsed.host : shop
  return base.split('.')[0]
}

/** gets the parent object (eg. product) from url */
export function getParentObject (theUrl) {
  let urlParsed = url.parse(theUrl)
  let pathname = path.basename(urlParsed.pathname, '.json')
  let splitPath = pathname.split(path.sep)
  let parent = difference(splitPath, ['', 'admin'])[0]
  return parent
}

/** simple return data response for axios */
export function returnData (response) {
  return response.data
}

/** get number of pages in array form given count and limit */
export function getPagesArray (count, limit) {
  let pages = Math.ceil(count / limit)
  return range(1, pages + 1)
}


export default function Shopify ({shop, accessToken, password, seconds, reqPerSec, limit}) {

  shop = cleanShop(shop)
  accessToken = accessToken || password
  seconds = seconds || 1000
  reqPerSec = reqPerSec || 2
  limit = limit || 250

  let instance = axios.create({
    baseURL: `https://${shop}.myshopify.com/admin`,
    headers: {'X-Shopify-Access-Token': accessToken}
  })

  instance.interceptors.request.use(function (config) {
      config.url = ensureJsonExt(config.url)
      let qs = querystring.stringify(config.params)
      qs = (qs) ? '?' + qs : ''
      debug(`${config.method} to ${config.url}${qs}`)
      return config
    }, function (error) {
      return Promise.reject(error)
    });

  // Add a response interceptor
  instance.interceptors.response.use(function (response) {
      response.parent = getParentObject(response.config.url)
      response.child = Object.keys(response.data)[0]
      return response
    }, function (error) {
      if (error.data.errors) throw new Error(error.data.errors)
      return Promise.reject(error)
    });

  instance.request = Promise.method(instance.request)
  instance.request = promiseDebounce(instance.request, seconds, reqPerSec)

  instance._get = (url, config) => {
    return instance.request(defaultsDeep({
      url,
      'method': 'GET'
    }, config))
  }

  instance.get = (url, config) => {
    return instance._get(url, config)
    .then(returnData)
  }

  instance.getAll = (url, config) => {
    let parent = getParentObject(url)
    return instance.get(`${parent}/count`, defaultsDeep({
      url,
    }, config))
    .then(({count}) => {
      debug(`count for ${parent} is ${count}`)
      let pagesArray = getPagesArray(count, limit)
      return Promise.map(pagesArray, page => {
        return instance._get(url, defaultsDeep({
          'params': {
            limit,
            page
          }
        }, config)).then(response => response.data[response.child])
      }).then(flatten)
    }).then(responses => {
      let tmp = {}
      tmp[parent] = responses
      return tmp
    })
  }

  instance.getWithMetafields = (url, config) => {
    return instance._getWithMetafields(url, config)
      .then(returnData)
  }

  instance._getWithMetafields = (url, config) => {
    return instance.request(defaultsDeep({
      url,
      'method': 'GET'
    }, config)).then(responseObject => {
      let parent = responseObject.parent
      let id = responseObject.data[responseObject.child].id
      let commonUrl = `${parent}/${id}/metafields`
      let theUrl = (parent === 'shop') ? '/metafields' : commonUrl
      return instance.get(theUrl)
      .then(({metafields}) => {
        responseObject.data[responseObject.child].metafields = metafields
        return responseObject
      })
    })
  }

  instance.delete = (url, config) => {
    return instance.request(defaultsDeep({
      url,
      'method': 'DELETE'
    }, config)).then(returnData)
  }

  instance.head = (url, config) => {
    return instance.request(defaultsDeep({
      url,
      'method': 'HEAD'
    }, config)).then(returnData)
  }

  instance.post = (url, data, config) => {
    return instance.request(defaultsDeep({
      url,
      data,
      'method': 'POST'
    }, config)).then(returnData)
  }

  instance.put = (url, data, config) => {
    return instance.request(defaultsDeep({
      url,
      data,
      'method': 'PUT'
    }, config)).then(returnData)
  }

  instance.patch = (url, data, config) => {
    return instance.request(defaultsDeep({
      url,
      data,
      'method': 'PATCH'
    }, config)).then(returnData)
  }

  return instance
}
