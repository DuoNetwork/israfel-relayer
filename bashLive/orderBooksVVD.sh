rm *.log
killall -s KILL node
npm run orderBooks tokens=ETH-100C-1H,ETH-100P-1H server env=live $1 &> orderBooks-all.log &
