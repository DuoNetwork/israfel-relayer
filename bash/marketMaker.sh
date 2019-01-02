rm *.log
killall -s KILL node
npm run marketMaker token=aETH env=dev $1 &> aETH.log &
npm run marketMaker token=sETH env=dev $1 &> sETH.log &
npm run marketMaker token=aETH-M19 env=dev $1 &> aETH-M19.log &
npm run marketMaker token=sETH-M19 env=dev $1 &> sETH-M19.log &
