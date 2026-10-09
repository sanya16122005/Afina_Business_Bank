using MailKit.Net.Smtp;
using MimeKit;

namespace Backend.Services
{
    public interface IEmailService
    {
        Task SendTwoFactorCodeAsync(string toEmail, string code);
        Task SendPasswordResetCodeAsync(string toEmail, string code);
    }

    public class EmailService : IEmailService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<EmailService> _logger;

        private const string LogoUrl = "https://i.ibb.co/wFL9yMMX/2026-03-09-19-14-10.png";

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _config = config;
            _logger = logger;
        }

        public async Task SendTwoFactorCodeAsync(string toEmail, string code)
        {
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(
                    _config["Email:SenderName"] ?? "Банк Афина",
                    _config["Email:SenderEmail"] ?? "noreply@afina.ru"));
                message.To.Add(MailboxAddress.Parse(toEmail));
                message.Subject = "Код подтверждения — Афина";

                var expiryMinutes = _config["TwoFactor:CodeExpirationMinutes"] ?? "5";

                message.Body = new TextPart("html")
                {
                    Text = $@"
<!DOCTYPE html>
<html>
<head>
<meta charset=""UTF-8"">
<meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
</head>
<body style=""margin: 0; padding: 0; background-color: #F7F5F3; font-family: 'Helvetica Neue', Arial, sans-serif;"">
<table cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""background-color: #F7F5F3; padding: 40px 0;"">
<tr>
<td align=""center"">
<table cellpadding=""0"" cellspacing=""0"" border=""0"" width=""480"" style=""max-width: 480px; background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.04);"">

  <!-- Header with logo -->
  <tr>
    <td style=""padding: 36px 40px 28px; text-align: center; background: #FFFFFF;"">
      <img src=""{LogoUrl}"" width=""180"" alt=""Афина Банк"" style=""display: block; margin: 0 auto; max-width: 180px; height: auto;"" />
    </td>
  </tr>

  <!-- Accent line -->
  <tr>
    <td style=""height: 3px; background: linear-gradient(90deg, #FDDECF, #F4A683, #FDDECF);""></td>
  </tr>

  <!-- Title -->
  <tr>
    <td style=""padding: 36px 40px 20px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #888888; margin: 0;"">
        Код подтверждения
      </p>
    </td>
  </tr>

  <!-- Code block -->
  <tr>
    <td style=""padding: 0 40px; text-align: center;"">
      <div style=""background: #FFF0E8; border-radius: 14px; border: 1px solid #FDDECF; padding: 24px 44px; display: inline-block;"">
        <span style=""font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #E8926E;"">{code}</span>
      </div>
    </td>
  </tr>

  <!-- Timer -->
  <tr>
    <td style=""padding: 28px 40px 12px; text-align: center;"">
      <span style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 13px; color: #888888;"">
        Код действителен <span style=""color: #E8926E; font-weight: 500;"">{expiryMinutes} минут</span>
      </span>
    </td>
  </tr>

  <!-- Warning -->
  <tr>
    <td style=""padding: 8px 40px 40px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 12px; color: #BBBBBB; margin: 0; line-height: 1.6;"">
        Если вы не запрашивали вход в систему,<br/>проигнорируйте это сообщение.
      </p>
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td style=""height: 1px; background: #F0EDE9;""></td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style=""padding: 24px 40px 28px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 11px; color: #CCCCCC; margin: 0; letter-spacing: 1px;"">
        &copy; 2026 Афина Банк
      </p>
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 10px; color: #DDDDDD; margin: 6px 0 0; letter-spacing: 0.5px;"">
        Москва, проспект Вернадского, дом 78, ауд. B-415 &middot; +7 (985) 311-76-90
      </p>
    </td>
  </tr>

</table>
</td>
</tr>
</table>
</body>
</html>"
                };

                using var client = new SmtpClient();
                var host = _config["Email:SmtpHost"] ?? "smtp.gmail.com";
                var port = int.Parse(_config["Email:SmtpPort"] ?? "587");
                var useSsl = bool.Parse(_config["Email:UseSsl"] ?? "false");

                await client.ConnectAsync(host, port, useSsl
                    ? MailKit.Security.SecureSocketOptions.SslOnConnect
                    : MailKit.Security.SecureSocketOptions.StartTls);

                await client.AuthenticateAsync(
                    _config["Email:SenderEmail"],
                    _config["Email:AppPassword"]);

                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                _logger.LogInformation("2FA code sent to {Email}", toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send 2FA code to {Email}", toEmail);
            }
        }

        public async Task SendPasswordResetCodeAsync(string toEmail, string code)
        {
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(
                    _config["Email:SenderName"] ?? "Банк Афина",
                    _config["Email:SenderEmail"] ?? "noreply@afina.ru"));
                message.To.Add(MailboxAddress.Parse(toEmail));
                message.Subject = "Сброс пароля — Афина";

                var expiryMinutes = _config["TwoFactor:CodeExpirationMinutes"] ?? "5";

                message.Body = new TextPart("html")
                {
                    Text = $@"
<!DOCTYPE html>
<html>
<head>
<meta charset=""UTF-8"">
<meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
</head>
<body style=""margin: 0; padding: 0; background-color: #F7F5F3; font-family: 'Helvetica Neue', Arial, sans-serif;"">
<table cellpadding=""0"" cellspacing=""0"" border=""0"" width=""100%"" style=""background-color: #F7F5F3; padding: 40px 0;"">
<tr>
<td align=""center"">
<table cellpadding=""0"" cellspacing=""0"" border=""0"" width=""480"" style=""max-width: 480px; background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.04);"">

  <!-- Header with logo -->
  <tr>
    <td style=""padding: 36px 40px 28px; text-align: center; background: #FFFFFF;"">
      <img src=""{LogoUrl}"" width=""180"" alt=""Афина Банк"" style=""display: block; margin: 0 auto; max-width: 180px; height: auto;"" />
    </td>
  </tr>

  <!-- Accent line -->
  <tr>
    <td style=""height: 3px; background: linear-gradient(90deg, #FDDECF, #F4A683, #FDDECF);""></td>
  </tr>

  <!-- Title -->
  <tr>
    <td style=""padding: 36px 40px 20px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #888888; margin: 0;"">
        Сброс пароля
      </p>
    </td>
  </tr>

  <!-- Code block -->
  <tr>
    <td style=""padding: 0 40px; text-align: center;"">
      <div style=""background: #FFF0E8; border-radius: 14px; border: 1px solid #FDDECF; padding: 24px 44px; display: inline-block;"">
        <span style=""font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #E8926E;"">{code}</span>
      </div>
    </td>
  </tr>

  <!-- Timer -->
  <tr>
    <td style=""padding: 28px 40px 12px; text-align: center;"">
      <span style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 13px; color: #888888;"">
        Код действителен <span style=""color: #E8926E; font-weight: 500;"">{expiryMinutes} минут</span>
      </span>
    </td>
  </tr>

  <!-- Warning -->
  <tr>
    <td style=""padding: 8px 40px 40px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 12px; color: #BBBBBB; margin: 0; line-height: 1.6;"">
        Если вы не запрашивали сброс пароля,<br/>проигнорируйте это сообщение.
      </p>
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td style=""height: 1px; background: #F0EDE9;""></td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style=""padding: 24px 40px 28px; text-align: center;"">
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 11px; color: #CCCCCC; margin: 0; letter-spacing: 1px;"">
        &copy; 2026 Афина Банк
      </p>
      <p style=""font-family: 'Helvetica Neue', Arial, sans-serif; font-weight: 300; font-size: 10px; color: #DDDDDD; margin: 6px 0 0; letter-spacing: 0.5px;"">
        Москва, проспект Вернадского, дом 78, ауд. B-415 &middot; +7 (985) 311-76-90
      </p>
    </td>
  </tr>

</table>
</td>
</tr>
</table>
</body>
</html>"
                };

                using var client = new SmtpClient();
                var host = _config["Email:SmtpHost"] ?? "smtp.gmail.com";
                var port = int.Parse(_config["Email:SmtpPort"] ?? "587");
                var useSsl = bool.Parse(_config["Email:UseSsl"] ?? "false");

                await client.ConnectAsync(host, port, useSsl
                    ? MailKit.Security.SecureSocketOptions.SslOnConnect
                    : MailKit.Security.SecureSocketOptions.StartTls);

                await client.AuthenticateAsync(
                    _config["Email:SenderEmail"],
                    _config["Email:AppPassword"]);

                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                _logger.LogInformation("Password reset code sent to {Email}", toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send password reset code to {Email}", toEmail);
            }
        }
    }
}
