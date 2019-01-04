[![CircleCI](https://circleci.com/gh/FinBook/israfel-relayer.svg?style=svg&circle-token=8be9fdcb4c676a363bb33f98216aae666b993f80)](https://circleci.com/gh/FinBook/israfel-relayer)
[![Coverage Status](https://coveralls.io/repos/github/FinBook/israfel-relayer/badge.svg?branch=master&t=pHNu0c)](https://coveralls.io/github/FinBook/israfel-relayer?branch=master)
# Israfel-Replayer
1. install pacakages
```
npm install
```
2. Pull the latest TestRPC 0x snapshot with all the 0x contracts pre-deployed and an account with ZRX balance
```
npm run download_snapshot
```
3. start TestRPC in a seperate terminal
```
npm start
```
4. start WebSocket server in another seperate terminal
```
npm run server
```
5. generate orders every 5 seconds and send to our relayer
```
npm run send_orders
```
6. run relayer server for RESTful APIs and websocket subscription
```
npm run relayer_ws
```
7. run relayer actions for fill/take orders
```
npm run actions
```

8. start orderWatcher
```
npm run orderWatcher token=ZRX
```


# Convention
For example, zrx-weth
zrx is base, weth is quote
bids - array of signed orders where takerAssetData is equal to baseAssetData
asks - array of signed orders where makerAssetData is equal to baseAssetData
