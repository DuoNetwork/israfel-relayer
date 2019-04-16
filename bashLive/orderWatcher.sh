rm *.log
killall -s KILL node
npm run orderWatcher server env=live tokens=aETH,bETH,sETH,LETH,ETH-100C-1H,ETH-100P-1H $1 &> orderWatcher.log &