rm *.log
killall -s KILL node
npm run orderBooks tokens=sETH,LETH,sETH-M19,LETH-M19 server $1 &> orderBooks-all.log &