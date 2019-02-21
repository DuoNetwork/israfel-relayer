rm *.log
killall -s KILL node
npm run orderBooks tokens=ETH-100C-3H,ETH-100P-3H server $1 &> orderBooks-all.log &