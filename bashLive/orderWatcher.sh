rm *.log
killall -s KILL node
npm run orderWatcher server env=live tokens=aETH,bETH,sETH,LETH $1 &> orderWatcher.log &