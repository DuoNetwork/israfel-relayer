rm *.log
killall -s KILL node
npm run orderWatcher server token=aETH,bETH,aETH-M19,bETH-M19 $1 &> orderWatcher-all.log &