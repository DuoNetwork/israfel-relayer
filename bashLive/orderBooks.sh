rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH,sETH,LETH server env=live $1 &> orderBooks-all.log &
