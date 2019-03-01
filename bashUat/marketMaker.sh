rm *.log
killall -s KILL node
npm run marketMaker tokens=aETH,sETH server env=uat $1 &> marketMaker.all.log &