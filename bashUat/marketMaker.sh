rm *.log
killall -s KILL node
npm run marketMaker tokens=aETH,sETH,aETH-M19,sETH-M19 env=uat $1 &> marketMaker.all.log