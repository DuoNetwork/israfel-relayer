rm *.log
killall -s KILL node
npm run orderWatcher server env=live tokens=aETH,bETH,ETH-100C-3H $1 &> orderWatcher-btv.log &
npm run orderWatcher server env=live tokens=sETH,LETH,ETH-100P-3H $1 &> orderWatcher-mzt.log &