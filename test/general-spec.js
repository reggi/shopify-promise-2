import Shopify from '../src/index'
import assert from 'assert'

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP
const SHOPIFY_PASSWORD = process.env.SHOPIFY_PASSWORD

/* global it, describe */

let shopify = new Shopify({
  'shop': SHOPIFY_SHOP,
  'password': SHOPIFY_PASSWORD
})

describe('Shopify', () => {
  it('should make request and get shop info', () => {
    return shopify.get('shop')
      .then(({shop}) => {
        assert.equal(shop.myshopify_domain, SHOPIFY_SHOP)
      })
  })
})
