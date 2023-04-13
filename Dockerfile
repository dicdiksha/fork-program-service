FROM bom.ocir.io/bmzbbujw9kal/diksha-odev/program-node:8.11.2-stretch as build
MAINTAINER "Kartheek Palla" "kartheekp@ilimi.in"
USER root
COPY src /opt/program-service/
WORKDIR /opt/program-service/
RUN npm install
CMD ["node", "app.js", "&"]
