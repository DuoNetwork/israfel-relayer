rm *.log
killall -s KILL node
npm run node server $1 &> node.log &
npm run orderWatcher server tokens=ETH-100C-3H,ETH-100P-3H $1 &> orderWatcher-vvd.log &