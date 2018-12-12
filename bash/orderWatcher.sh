rm *.log
killall -s KILL node
npm run orderWatcher token=aETH server $1 &> orderWatcher-aETH.log &
npm run orderWatcher token=bETH server $1 &> orderWatcher-bETH.log &
npm run orderWatcher token=sETH server $1 &> orderWatcher-sETH.log &
npm run orderWatcher token=LETH server $1 &> orderWatcher-LETH.log &
npm run orderWatcher token=aETH-M19 server $1 &> orderWatcher-aETH-M19.log &
npm run orderWatcher token=bETH-M19 server $1 &> orderWatcher-bETH-M19.log &
npm run orderWatcher token=sETH-M19 server $1 &> orderWatcher-sETH-M19.log &
npm run orderWatcher token=LETH-M19 server $1 &> orderWatcher-LETH-M19.log &