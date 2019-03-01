rm *.log
killall -s KILL node
npm run orderBooks tokens=sETH,LETH,ETH-100P-3H server env=uat $1 &> orderBooks-all.log &