FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . /app

ENV BMP_HOST=0.0.0.0
ENV BMP_PORT=7860
ENV BMP_DEBUG=false

EXPOSE 7860

CMD ["python", "run_web.py"]