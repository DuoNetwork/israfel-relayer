rm *.log
killall -s KILL node
npm run orderBooks tokens=aETH,bETH,sETH,LETH server env=uat $1 &> orderBooks-all.log &
