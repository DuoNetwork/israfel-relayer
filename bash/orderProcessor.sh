rm *.log
killall -s KILL node
npm run orders server $1 &> orders.log &
npm run orderBooks token=aETH server $1 &> orderBooks-aETH.log &
npm run orderBooks token=bETH server $1 &> orderBooks-bETH.log &
npm run orderBooks token=sETH server $1 &> orderBooks-sETH.log &
npm run orderBooks token=LETH server $1 &> orderBooks-LETH.log &
npm run orderBooks token=aETH-M19 server $1 &> orderBooks-aETH-M19.log &
npm run orderBooks token=bETH-M19 server $1 &> orderBooks-bETH-M19.log &
npm run orderBooks token=sETH-M19 server $1 &> orderBooks-sETH-M19.log &
npm run orderBooks token=LETH-M19 server $1 &> orderBooks-LETH-M19.log &