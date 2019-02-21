rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH server $1 &> orderBooks-all.log &