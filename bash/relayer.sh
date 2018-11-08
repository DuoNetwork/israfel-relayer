rm *.log
killall -s KILL node
npm run relayer server $1 &> relayer.log &