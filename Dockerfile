FROM nginx:alpine

COPY app.js index.html icon.svg sw.js worker.js styles.css manifest.json vendor/ /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 