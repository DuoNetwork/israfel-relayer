rm *.log
killall -s KILL node
npm run marketMaker token=aETH env=dev $1 &> aETH.log &