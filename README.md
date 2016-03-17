# Shopify Promise 2

A smooth Shopify API wrapper using `axios` / promises and features rate-limiting.

## Install

```bash
npm install shopify-promise-2
```

## Usage

```js
shopify.get('shop').then(({shop}) => {
  assert.equal(shop.myshopify_domain, SHOPIFY_SHOP)
})
```

## Methods

```js
shopify.get('shop') // gets object
shopify.getAll('orders') // gets all objects (even if more than 250)
shopify.getWithMetafields('product/123567') // gets object with metafields
shopify.put()
shopify.delete()
shopify.head()
shopify.post()
shopify.patch()
```
