rm *.log
killall -s KILL node
npm run orderBooks tokens=ETH-100P-1H,ETH-100C-1H server env=uat $1 &> orderBooks.ETH-100C-1H.log &