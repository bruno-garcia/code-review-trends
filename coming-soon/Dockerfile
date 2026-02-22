FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 8080
# Cloud Run sends SIGTERM; nginx needs to stop gracefully
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
