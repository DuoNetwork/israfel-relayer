rm *.log
killall -s KILL node
npm run orderWatcher server tokens=sETH,LETH,sETH-M19,LETH-M19 $1 &> orderWatcher-all.log &