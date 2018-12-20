rm *.log
killall -s KILL node
npm run node server env=uat $1 &> node.log &
npm run orderWatcher server env=uat tokens=aETH,bETH,aETH-M19,bETH-M19 $1 &> orderWatcher-btv.log &
npm run orderWatcher server env=uat tokens=sETH,LETH,sETH-M19,LETH-M19 $1 &> orderWatcher-mzt.log &