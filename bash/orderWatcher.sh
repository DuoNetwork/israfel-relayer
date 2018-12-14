rm *.log
killall -s KILL node
npm run orderWatcher server tokens=aETH,bETH,aETH-M19,bETH-M19 $1 &> orderWatcher-btv.log &
npm run orderWatcher server tokens=sETH,LETH,sETH-M19,LETH-M19 $1 &> orderWatcher-mzt.log &