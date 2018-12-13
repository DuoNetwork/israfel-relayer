rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH,aETH-M19,bETH-M19 server $1 &> orderBooks-all.log &