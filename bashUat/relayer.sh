rm *.log
killall -s KILL node
npm run relayer server env=uat $1 &> relayer.log &