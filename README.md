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
