rm *.log
killall -s KILL node
npm run node server env=uat $1 &> node.log &
npm run orderWatcher server env=uat tokens=aETH,bETH,ETH-100C-1H $1 &> orderWatcher-btv.log &
npm run orderWatcher server env=uat tokens=sETH,LETH,ETH-100P-1H $1 &> orderWatcher-mzt.log &