rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH,aETH-M19,bETH-M19 server env=uat $1 &> orderBooks-all.log &
npm run orderBooks tokens=ETH-100C-3H server env=uat $1 &> orderBooks.ETH-100C-3H.log &