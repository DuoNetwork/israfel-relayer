rm *.log
killall -s KILL node
npm run orderBooks tokens=sETH,LETH,sETH-M19,LETH-M19 server env=uat $1 &> orderBooks-all.log &
npm run orderBooks tokens=ETH-100P-3H server env=uat $1 &> orderBooks.ETH-100P-3H.log &