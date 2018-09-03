# Duo-Replayer
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
npm run testrpc
```
4. start WebSocket server in another seperate terminal
```
npm run server
```
5. generate a initial orderbook to fill our fake api with orders signed by addresses available from testrpc
```
npm run init_orderbook
```
6. run relayer server
```
npm run relayer_ws
```
