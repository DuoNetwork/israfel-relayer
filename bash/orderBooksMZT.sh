rm *.log
killall -s KILL node
npm run orderBooks token=sETH server $1 &> orderBooks-sETH.log &
npm run orderBooks token=LETH server $1 &> orderBooks-LETH.log &
npm run orderBooks token=sETH-M19 server $1 &> orderBooks-sETH-M19.log &
npm run orderBooks token=LETH-M19 server $1 &> orderBooks-LETH-M19.log &