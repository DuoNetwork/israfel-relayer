rm *.log
killall -s KILL node
npm run node server $1 &> node.log &
npm run orderWatcher server tokens=aETH,bETH $1 &> orderWatcher-btv.log &