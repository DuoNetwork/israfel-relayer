rm *.log
killall -s KILL node
npm run marketMaker token=aETH env=uat $1 &> aETH.log &
npm run marketMaker token=sETH env=uat $1 &> sETH.log &
npm run marketMaker token=aETH-M19 env=uat $1 &> aETH-M19.log &
npm run marketMaker token=sETH-M19 env=uat $1 &> sETH-M19.log &