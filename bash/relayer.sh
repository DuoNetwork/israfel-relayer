rm *.log
killall -s KILL node
npm run relayer server &> relayer.log &