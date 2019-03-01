rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH,ETH-100C-3H server env=uat $1 &> orderBooks-all.log &
