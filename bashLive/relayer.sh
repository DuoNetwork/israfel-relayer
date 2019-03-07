rm *.log
killall -s KILL node
npm run relayer server env=live $1 &> relayer.log &